import { parse } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
import BaseConnector from './BaseConnector.js';

/**
 * Connector for CSV and Excel file uploads.
 * Fully working — parses file buffer into rows matching sf_* schema.
 *
 * Config shape:
 * {
 *   fileBuffer: Buffer,        // required — the uploaded file
 *   fileName: string,          // required — original filename (for type detection)
 *   targetTable: string,       // required — which sf_* table to load into
 *   column_map: object|null,   // optional — { sourceCol: 'sf_col_name' }
 * }
 */
export default class FileUploadConnector extends BaseConnector {
  constructor(tenantId, config) {
    super(tenantId, config, null);
    this.rows = null;
  }

  async connect() {
    const { fileBuffer, fileName } = this.config;
    if (!fileBuffer || !fileName) {
      throw new Error('FileUploadConnector requires fileBuffer and fileName in config');
    }

    const ext = fileName.split('.').pop().toLowerCase();
    if (ext === 'csv') {
      this.rows = this._parseCsv(fileBuffer);
    } else if (['xlsx', 'xls'].includes(ext)) {
      this.rows = this._parseExcel(fileBuffer);
    } else {
      throw new Error(`Unsupported file type: .${ext} (expected .csv, .xlsx, or .xls)`);
    }
  }

  async fetchTable(targetTable) {
    if (!this.rows) throw new Error('Not connected — call connect() first');

    // Only return rows for the target table specified in config
    if (targetTable !== this.config.targetTable) {
      return [];
    }

    return this._applyColumnMap(this.rows);
  }

  async testConnection() {
    try {
      await this.connect();
      const count = this.rows?.length ?? 0;
      return { success: true, message: `Parsed ${count} rows from ${this.config.fileName}` };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  // ─── Private ────────────────────────────────────────────────────────

  _parseCsv(buffer) {
    const content = buffer.toString('utf-8');
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      cast: true,
      cast_date: false,
    });

    return records.map(row => this._normalizeHeaders(row));
  }

  _parseExcel(buffer) {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const records = XLSX.utils.sheet_to_json(sheet, { defval: null });

    return records.map(row => this._normalizeHeaders(row));
  }

  /**
   * Normalize header names: lowercase, spaces/dashes to underscores.
   */
  _normalizeHeaders(row) {
    const normalized = {};
    for (const [key, value] of Object.entries(row)) {
      const normalizedKey = key.toLowerCase().replace(/[\s-]+/g, '_');
      normalized[normalizedKey] = value;
    }
    return normalized;
  }

  /**
   * Apply optional column_map renaming: source column → sf_* column.
   */
  _applyColumnMap(rows) {
    const map = this.config.column_map;
    if (!map || Object.keys(map).length === 0) return rows;

    return rows.map(row => {
      const mapped = {};
      for (const [key, value] of Object.entries(row)) {
        const targetCol = map[key] || key;
        mapped[targetCol] = value;
      }
      return mapped;
    });
  }
}
