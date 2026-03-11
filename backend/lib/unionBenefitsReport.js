import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';

// ─── WinTeam Excel Parser ─────────────────────────────────────────────

/**
 * Parse a WinTeam timekeeping export (xls/xlsx).
 * Scans rows 0-20 to find the header row, builds column index map,
 * returns { colMap, rows }.
 */
export function parseWinTeamExcel(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const allRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  // Required columns (case-insensitive partial match)
  const REQUIRED = ['JobNumber', 'EmployeeName', 'Hours', 'HoursTypeDescription'];
  const OPTIONAL = ['EmployeeNumber', 'EmployeeType', 'SSN', 'JobName'];

  let headerRowIdx = -1;
  let colMap = {};

  for (let i = 0; i < Math.min(allRows.length, 20); i++) {
    const row = allRows[i];
    if (!Array.isArray(row)) continue;

    const headerCells = row.map(c => String(c).trim());
    const matchCount = REQUIRED.filter(req =>
      headerCells.some(cell => cell.toLowerCase().includes(req.toLowerCase()))
    ).length;

    if (matchCount >= REQUIRED.length) {
      headerRowIdx = i;
      // Build column map
      for (let j = 0; j < headerCells.length; j++) {
        const cell = headerCells[j];
        for (const col of [...REQUIRED, ...OPTIONAL]) {
          if (cell.toLowerCase().includes(col.toLowerCase())) {
            colMap[col] = j;
          }
        }
      }
      break;
    }
  }

  if (headerRowIdx === -1) {
    throw new Error(
      'Could not find header row in WinTeam file. Expected columns: ' +
      REQUIRED.join(', ')
    );
  }

  // Data rows start after header
  const dataRows = allRows.slice(headerRowIdx + 1).filter(row => {
    // Skip empty rows
    if (!Array.isArray(row)) return false;
    const hasHours = colMap.Hours !== undefined && row[colMap.Hours] !== '' && row[colMap.Hours] !== null;
    const hasName = colMap.EmployeeName !== undefined && row[colMap.EmployeeName] !== '';
    return hasHours || hasName;
  });

  return { colMap, rows: dataRows };
}

// ─── Classify & Aggregate ─────────────────────────────────────────────

/**
 * Classify each row by hour type and aggregate per employee.
 * Returns { employees, warnings, unrecognizedTypes }.
 */
export function classifyAndAggregate(rows, colMap, unionConfig) {
  const vacTypes = new Set((unionConfig.vac_hour_types || []).map(t => t.toLowerCase()));
  const excludeTypes = new Set((unionConfig.exclude_hour_types || []).map(t => t.toLowerCase()));
  const empFilter = unionConfig.employee_type_filter;
  const minHours = unionConfig.min_hours_for_benefits || 0;

  const empMap = new Map(); // empId → { empId, empName, jobNumber, regHours, vacHours }
  const warnings = [];
  const unrecognizedTypes = new Set();

  for (const row of rows) {
    const empId = String(row[colMap.EmployeeNumber] || '').trim();
    const empName = String(row[colMap.EmployeeName] || '').trim();
    const jobNumber = String(row[colMap.JobNumber] || '').trim();
    const hours = parseFloat(row[colMap.Hours]) || 0;
    const hourType = String(row[colMap.HoursTypeDescription] || '').trim();
    const empType = colMap.EmployeeType !== undefined
      ? String(row[colMap.EmployeeType] || '').trim()
      : null;

    // Filter by employee type if configured
    if (empFilter && empType && !empType.toLowerCase().includes(empFilter.toLowerCase())) {
      continue;
    }

    if (!empId && !empName) continue;

    const hourTypeLower = hourType.toLowerCase();

    // Classify
    if (excludeTypes.has(hourTypeLower)) {
      continue; // skip excluded types entirely
    }

    // Get or create employee record
    const key = empId || empName;
    if (!empMap.has(key)) {
      empMap.set(key, {
        empId,
        empName,
        jobNumber,
        regHours: 0,
        vacHours: 0,
      });
    }
    const emp = empMap.get(key);

    // Update job number if we have one and the existing is empty
    if (jobNumber && !emp.jobNumber) emp.jobNumber = jobNumber;

    if (vacTypes.has(hourTypeLower)) {
      emp.vacHours += hours;
    } else {
      // Check for unrecognized types (not in vac and not in exclude)
      if (hourType && !vacTypes.has(hourTypeLower) && !excludeTypes.has(hourTypeLower)) {
        // It's a regular hour type — no warning needed unless it looks unusual
      }
      emp.regHours += hours;
    }
  }

  // Convert to sorted array
  const employees = Array.from(empMap.values())
    .sort((a, b) => (a.empId || a.empName).localeCompare(b.empId || b.empName, undefined, { numeric: true }));

  // Generate warnings
  for (const emp of employees) {
    const totalHours = emp.regHours + emp.vacHours;
    if (totalHours === 0) {
      warnings.push({ type: 'zero_hours', empId: emp.empId, empName: emp.empName });
    } else if (totalHours < 0) {
      warnings.push({ type: 'negative_hours', empId: emp.empId, empName: emp.empName, hours: totalHours });
    } else if (totalHours < 40) {
      warnings.push({ type: 'low_hours', empId: emp.empId, empName: emp.empName, hours: totalHours });
    }
    if (minHours > 0 && totalHours < minHours) {
      warnings.push({
        type: 'below_minimum',
        empId: emp.empId,
        empName: emp.empName,
        hours: totalHours,
        minimum: minHours,
      });
    }
  }

  return { employees, warnings, unrecognizedTypes: Array.from(unrecognizedTypes) };
}

// ─── Job Summary ──────────────────────────────────────────────────────

/**
 * Group employees by jobNumber for the job summary section.
 */
export function buildJobSummary(employees) {
  const jobMap = new Map();
  for (const emp of employees) {
    const job = emp.jobNumber || 'UNKNOWN';
    if (!jobMap.has(job)) {
      jobMap.set(job, { jobNumber: job, empCount: 0, regHours: 0, vacHours: 0 });
    }
    const j = jobMap.get(job);
    j.empCount++;
    j.regHours += emp.regHours;
    j.vacHours += emp.vacHours;
  }
  return Array.from(jobMap.values()).sort((a, b) => a.jobNumber.localeCompare(b.jobNumber, undefined, { numeric: true }));
}

// ─── Excel Report Generation ──────────────────────────────────────────

/**
 * Generate the union benefits Excel report using ExcelJS.
 * Returns a Buffer (xlsx).
 */
export async function generateExcelReport(employees, jobSummary, unionConfig, reportMonth) {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('Union Benefits', {
    views: [{ state: 'frozen', ySplit: 7 }],
  });

  const hwRate = parseFloat(unionConfig.hw_rate);
  const pensionRate = parseFloat(unionConfig.pension_rate);

  // Format report month
  const [year, month] = reportMonth.split('-');
  const monthDate = new Date(parseInt(year), parseInt(month) - 1, 1);
  const monthLabel = monthDate.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });

  // ── Column widths ─────────────────────────────────────────
  ws.columns = [
    { width: 10 },  // A: Emp Id
    { width: 10 },  // B: Job #
    { width: 28 },  // C: Mechanic (employee name)
    { width: 10 },  // D: Reg
    { width: 18 },  // E: FMLA/Disability/WC
    { width: 10 },  // F: Vac
    { width: 14 },  // G: H&W Trust
    { width: 14 },  // H: Pension
    { width: 18 },  // I: Notes
    { width: 2 },   // J: spacer
    { width: 12 },  // K: Job #
    { width: 10 },  // L: # Emps
    { width: 12 },  // M: Reg Hours
    { width: 12 },  // N: Vac Hours
    { width: 14 },  // O: H&W
    { width: 14 },  // P: Pension
  ];

  // ── Styles ────────────────────────────────────────────────
  const boldFont = { bold: true };
  const headerFont = { bold: true, size: 10 };
  const numberFmt = '#,##0.00';
  const currencyFmt = '$#,##0.00';
  const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } };
  const pinkFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4EC' } };
  const thinBorder = {
    top: { style: 'thin' },
    bottom: { style: 'thin' },
    left: { style: 'thin' },
    right: { style: 'thin' },
  };

  // ── Header rows ───────────────────────────────────────────
  // Row 2: Trust name
  ws.getCell('C2').value = unionConfig.trust_name;
  ws.getCell('C2').font = { bold: true, size: 12 };

  // Row 3: Trust address
  ws.getCell('C3').value = unionConfig.trust_address || '';
  ws.getCell('C3').font = { size: 10 };

  // Row 4: Report date
  ws.getCell('C4').value = monthLabel;
  ws.getCell('C4').font = { bold: true, size: 10 };

  // Row 6: Column group headers
  ws.getCell('G6').value = `H&W Trust 01/1F`;
  ws.getCell('G6').font = boldFont;
  ws.getCell('H6').value = 'Pension';
  ws.getCell('H6').font = boldFont;
  ws.getCell('I6').value = 'Notes';
  ws.getCell('I6').font = boldFont;

  // Row 7: Column headers
  const headers = ['Emp Id', 'Job #', 'Mechanic', 'Reg', 'FMLA/Disability/WC', 'Vac'];
  headers.forEach((h, i) => {
    const cell = ws.getCell(7, i + 1);
    cell.value = h;
    cell.font = headerFont;
    cell.fill = headerFill;
    cell.border = thinBorder;
  });

  // G7 and H7: rate cells (used by formulas)
  const g7 = ws.getCell('G7');
  g7.value = hwRate;
  g7.font = headerFont;
  g7.fill = headerFill;
  g7.border = thinBorder;
  g7.numFmt = currencyFmt;

  const h7 = ws.getCell('H7');
  h7.value = pensionRate;
  h7.font = headerFont;
  h7.fill = headerFill;
  h7.border = thinBorder;
  h7.numFmt = currencyFmt;

  const i7 = ws.getCell('I7');
  i7.value = '';
  i7.fill = headerFill;
  i7.border = thinBorder;

  // ── Data rows ─────────────────────────────────────────────
  const dataStartRow = 8;
  const flaggedEmpIds = new Set();

  employees.forEach((emp, idx) => {
    const rowNum = dataStartRow + idx;
    const totalHours = emp.regHours + emp.vacHours;

    // Flag employees with 0 or negative hours
    if (totalHours <= 0 || totalHours < 40) {
      flaggedEmpIds.add(emp.empId);
    }

    // A: Emp Id
    ws.getCell(rowNum, 1).value = emp.empId;
    ws.getCell(rowNum, 1).border = thinBorder;

    // B: Job #
    ws.getCell(rowNum, 2).value = emp.jobNumber;
    ws.getCell(rowNum, 2).border = thinBorder;

    // C: Name
    ws.getCell(rowNum, 3).value = emp.empName;
    ws.getCell(rowNum, 3).border = thinBorder;

    // D: Reg hours
    const dCell = ws.getCell(rowNum, 4);
    dCell.value = Math.round(emp.regHours * 100) / 100;
    dCell.numFmt = numberFmt;
    dCell.border = thinBorder;

    // E: FMLA/Disability/WC — starts at 0, user edits manually
    const eCell = ws.getCell(rowNum, 5);
    eCell.value = 0;
    eCell.numFmt = numberFmt;
    eCell.border = thinBorder;

    // F: Vac hours
    const fCell = ws.getCell(rowNum, 6);
    fCell.value = Math.round(emp.vacHours * 100) / 100;
    fCell.numFmt = numberFmt;
    fCell.border = thinBorder;

    // G: H&W = (Reg + FMLA) * hw_rate → =D{n}*$G$7+E{n}*$G$7
    const gCell = ws.getCell(rowNum, 7);
    gCell.value = { formula: `D${rowNum}*$G$7+E${rowNum}*$G$7` };
    gCell.numFmt = currencyFmt;
    gCell.border = thinBorder;

    // H: Pension = (Reg + Vac) * pension_rate → =(D{n}+F{n})*$H$7
    const hCell = ws.getCell(rowNum, 8);
    hCell.value = { formula: `(D${rowNum}+F${rowNum})*$H$7` };
    hCell.numFmt = currencyFmt;
    hCell.border = thinBorder;

    // I: Notes — blank
    ws.getCell(rowNum, 9).border = thinBorder;

    // Pink fill for flagged rows
    if (flaggedEmpIds.has(emp.empId)) {
      for (let col = 1; col <= 9; col++) {
        ws.getCell(rowNum, col).fill = pinkFill;
      }
    }
  });

  // ── Totals row ────────────────────────────────────────────
  const lastDataRow = dataStartRow + employees.length - 1;
  const totalsRow = lastDataRow + 1;

  ws.getCell(totalsRow, 3).value = 'TOTALS';
  ws.getCell(totalsRow, 3).font = boldFont;

  // D total: =SUM(D8:D{last})
  const dTotal = ws.getCell(totalsRow, 4);
  dTotal.value = { formula: `SUM(D${dataStartRow}:D${lastDataRow})` };
  dTotal.numFmt = numberFmt;
  dTotal.font = boldFont;
  dTotal.border = thinBorder;

  // E total
  const eTotal = ws.getCell(totalsRow, 5);
  eTotal.value = { formula: `SUM(E${dataStartRow}:E${lastDataRow})` };
  eTotal.numFmt = numberFmt;
  eTotal.font = boldFont;
  eTotal.border = thinBorder;

  // F total
  const fTotal = ws.getCell(totalsRow, 6);
  fTotal.value = { formula: `SUM(F${dataStartRow}:F${lastDataRow})` };
  fTotal.numFmt = numberFmt;
  fTotal.font = boldFont;
  fTotal.border = thinBorder;

  // G total: H&W
  const gTotal = ws.getCell(totalsRow, 7);
  gTotal.value = { formula: `SUM(G${dataStartRow}:G${lastDataRow})` };
  gTotal.numFmt = currencyFmt;
  gTotal.font = boldFont;
  gTotal.border = thinBorder;

  // H total: Pension
  const hTotal = ws.getCell(totalsRow, 8);
  hTotal.value = { formula: `SUM(H${dataStartRow}:H${lastDataRow})` };
  hTotal.numFmt = currencyFmt;
  hTotal.font = boldFont;
  hTotal.border = thinBorder;

  // ── Footer ────────────────────────────────────────────────
  const footerStart = totalsRow + 2;

  ws.getCell(footerStart, 3).value = 'TOTAL HOURS';
  ws.getCell(footerStart, 3).font = boldFont;
  ws.getCell(footerStart, 4).value = { formula: `D${totalsRow}+E${totalsRow}+F${totalsRow}` };
  ws.getCell(footerStart, 4).numFmt = numberFmt;
  ws.getCell(footerStart, 4).font = boldFont;

  ws.getCell(footerStart + 1, 3).value = 'Total H&W Trust';
  ws.getCell(footerStart + 1, 3).font = boldFont;
  ws.getCell(footerStart + 1, 7).value = { formula: `G${totalsRow}` };
  ws.getCell(footerStart + 1, 7).numFmt = currencyFmt;
  ws.getCell(footerStart + 1, 7).font = boldFont;

  ws.getCell(footerStart + 2, 3).value = 'BALANCE';
  ws.getCell(footerStart + 2, 3).font = boldFont;
  // Blank — user fills in

  ws.getCell(footerStart + 3, 3).value = 'Pension';
  ws.getCell(footerStart + 3, 3).font = boldFont;
  ws.getCell(footerStart + 3, 8).value = { formula: `H${totalsRow}` };
  ws.getCell(footerStart + 3, 8).numFmt = currencyFmt;
  ws.getCell(footerStart + 3, 8).font = boldFont;

  ws.getCell(footerStart + 4, 3).value = 'Adjustment';
  ws.getCell(footerStart + 4, 3).font = boldFont;
  // Blank

  ws.getCell(footerStart + 5, 3).value = 'Adjustment';
  ws.getCell(footerStart + 5, 3).font = boldFont;
  // Blank

  ws.getCell(footerStart + 6, 3).value = 'GRAND TOTAL';
  ws.getCell(footerStart + 6, 3).font = { bold: true, size: 11 };
  // Grand total = H&W + Pension + adjustments
  ws.getCell(footerStart + 6, 7).value = {
    formula: `G${footerStart + 1}+G${footerStart + 2}+G${footerStart + 4}+G${footerStart + 5}`,
  };
  ws.getCell(footerStart + 6, 7).numFmt = currencyFmt;
  ws.getCell(footerStart + 6, 7).font = { bold: true, size: 11 };
  ws.getCell(footerStart + 6, 8).value = {
    formula: `H${footerStart + 3}+H${footerStart + 4}+H${footerStart + 5}`,
  };
  ws.getCell(footerStart + 6, 8).numFmt = currencyFmt;
  ws.getCell(footerStart + 6, 8).font = { bold: true, size: 11 };

  // ── Job Summary (cols K-P) ────────────────────────────────
  // Header row 6
  ws.getCell('K6').value = 'JOB SUMMARY';
  ws.getCell('K6').font = { bold: true, size: 11 };

  // Header row 7
  const jobHeaders = ['Job #', '# Emps', 'Reg Hours', 'Vac Hours', 'H&W', 'Pension'];
  jobHeaders.forEach((h, i) => {
    const cell = ws.getCell(7, 11 + i); // K=11
    cell.value = h;
    cell.font = headerFont;
    cell.fill = headerFill;
    cell.border = thinBorder;
  });

  // Job summary data using SUMIF formulas
  jobSummary.forEach((job, idx) => {
    const rowNum = dataStartRow + idx;

    // K: Job #
    ws.getCell(rowNum, 11).value = job.jobNumber;
    ws.getCell(rowNum, 11).border = thinBorder;

    // L: # Emps — COUNTIF
    ws.getCell(rowNum, 12).value = { formula: `COUNTIF(B${dataStartRow}:B${lastDataRow},"${job.jobNumber}")` };
    ws.getCell(rowNum, 12).border = thinBorder;

    // M: Reg Hours — SUMIF
    ws.getCell(rowNum, 13).value = { formula: `SUMIF(B${dataStartRow}:B${lastDataRow},"${job.jobNumber}",D${dataStartRow}:D${lastDataRow})` };
    ws.getCell(rowNum, 13).numFmt = numberFmt;
    ws.getCell(rowNum, 13).border = thinBorder;

    // N: Vac Hours — SUMIF
    ws.getCell(rowNum, 14).value = { formula: `SUMIF(B${dataStartRow}:B${lastDataRow},"${job.jobNumber}",F${dataStartRow}:F${lastDataRow})` };
    ws.getCell(rowNum, 14).numFmt = numberFmt;
    ws.getCell(rowNum, 14).border = thinBorder;

    // O: H&W — SUMIF
    ws.getCell(rowNum, 15).value = { formula: `SUMIF(B${dataStartRow}:B${lastDataRow},"${job.jobNumber}",G${dataStartRow}:G${lastDataRow})` };
    ws.getCell(rowNum, 15).numFmt = currencyFmt;
    ws.getCell(rowNum, 15).border = thinBorder;

    // P: Pension — SUMIF
    ws.getCell(rowNum, 16).value = { formula: `SUMIF(B${dataStartRow}:B${lastDataRow},"${job.jobNumber}",H${dataStartRow}:H${lastDataRow})` };
    ws.getCell(rowNum, 16).numFmt = currencyFmt;
    ws.getCell(rowNum, 16).border = thinBorder;
  });

  // Job summary totals
  if (jobSummary.length > 0) {
    const jobLastRow = dataStartRow + jobSummary.length - 1;
    const jobTotalRow = jobLastRow + 1;

    ws.getCell(jobTotalRow, 11).value = 'TOTAL';
    ws.getCell(jobTotalRow, 11).font = boldFont;

    ['L', 'M', 'N', 'O', 'P'].forEach((col, i) => {
      const cell = ws.getCell(jobTotalRow, 12 + i);
      cell.value = { formula: `SUM(${col}${dataStartRow}:${col}${jobLastRow})` };
      cell.font = boldFont;
      cell.border = thinBorder;
      cell.numFmt = i >= 3 ? currencyFmt : numberFmt;
    });
  }

  // Generate buffer
  return workbook.xlsx.writeBuffer();
}
