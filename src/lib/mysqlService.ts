/**
 * City Government of Tacloban - PRAISE Management System
 * XAMPP (Apache + MySQL + PHP) Integration & Database Bridge
 */

import {
  Application,
  ApplicationDocument,
  ApplicationHistory,
  Award,
  InAppNotification,
  Office,
  UserProfile
} from '../types';

export interface XamppConnectionStatus {
  connected: boolean;
  message: string;
  database?: string;
  engine?: string;
  counts?: {
    applications: number;
    users: number;
  };
  endpointTested: string;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function getModuleScriptPathname(): string {
  if (typeof document === 'undefined') return '';

  const scripts = Array.from(document.querySelectorAll<HTMLScriptElement>('script[src]'));
  const appScript = scripts.find(script => /\/(src|assets)\//.test(script.src)) || scripts[scripts.length - 1];

  if (!appScript?.src) return '';

  try {
    return new URL(appScript.src, window.location.href).pathname;
  } catch {
    return '';
  }
}

export function getAppBasePath(): string {
  if (typeof window === 'undefined') return '';

  const scriptPath = getModuleScriptPathname();
  if (scriptPath) {
    const baseFromScript = scriptPath
      .replace(/\/assets\/.*$/, '')
      .replace(/\/src\/.*$/, '');

    if (baseFromScript === '/') {
      return '';
    }

    if (baseFromScript) {
      return trimTrailingSlash(baseFromScript);
    }
  }

  const currentPath = trimTrailingSlash(window.location.pathname);
  return currentPath === '/' ? '' : currentPath;
}

export function getDefaultXamppApiUrl(): string {
  const basePath = getAppBasePath();
  return `${basePath}/api`.replace(/\/{2,}/g, '/');
}

export function resolveProjectUrl(pathOrUrl: string): string {
  if (!pathOrUrl) return '';

  if (/^https?:\/\//i.test(pathOrUrl) || pathOrUrl.startsWith('blob:') || pathOrUrl.startsWith('data:')) {
    return pathOrUrl;
  }

  const normalized = pathOrUrl.replace(/^\/+/, '');
  const basePath = getAppBasePath();
  return `${window.location.origin}${basePath ? `${basePath}/` : '/'}${normalized}`.replace(/([^:]\/)\/+/g, '$1');
}

function normalizeApiBaseUrl(apiUrl: string): string {
  const cleaned = trimTrailingSlash(apiUrl.trim());

  if (/^https?:\/\//i.test(cleaned) || cleaned.startsWith('/')) {
    return cleaned;
  }

  const basePath = getAppBasePath();
  return `${basePath}/${cleaned}`.replace(/\/{2,}/g, '/');
}

function buildApiCandidates(customApiUrl?: string): string[] {
  const candidates = [
    customApiUrl ? normalizeApiBaseUrl(customApiUrl) : getDefaultXamppApiUrl(),
    '/api'
  ];

  return [...new Set(candidates.map(candidate => trimTrailingSlash(candidate)).filter(Boolean))];
}

/**
 * Check if the XAMPP PHP API & MySQL database are reachable
 */
export async function checkXamppConnection(customApiUrl?: string): Promise<XamppConnectionStatus> {
  const candidates = buildApiCandidates(customApiUrl);
  let lastFailure: XamppConnectionStatus | null = null;

  for (const base of candidates) {
    const endpoint = `${base}/health.php`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

      const res = await fetch(endpoint, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        lastFailure = {
          connected: false,
          message: `HTTP ${res.status}: ${res.statusText}`,
          endpointTested: endpoint
        };
        continue;
      }

      const data = await res.json();
      return {
        connected: Boolean(data.data?.database_connected),
        message: data.message || 'XAMPP MySQL database is connected.',
        database: data.data?.database || 'tacloban_praise_db',
        engine: data.data?.engine || 'MySQL / MariaDB (XAMPP)',
        counts: data.data?.counts,
        endpointTested: endpoint
      };
    } catch (err: any) {
      lastFailure = {
        connected: false,
        message: err.name === 'AbortError'
          ? 'Connection timed out. Check if Apache/MySQL is running in XAMPP.'
          : 'Cannot reach the XAMPP PHP API endpoint.',
        endpointTested: endpoint
      };
    }
  }

  return lastFailure || {
    connected: false,
    message: 'Cannot reach the XAMPP PHP API endpoint.',
    endpointTested: candidates[0] ? `${candidates[0]}/health.php` : '/api/health.php'
  };
}

/**
 * Generate full MySQL / MariaDB SQL dump string from in-app state
 */
export function generateMysqlDump(data: {
  applications: Application[];
  awards: Award[];
  offices: Office[];
  users: UserProfile[];
  auditLogs: ApplicationHistory[];
  notifications: InAppNotification[];
}): string {
  const escapeSql = (str: string | undefined | null): string => {
    if (str === null || str === undefined) return 'NULL';
    return "'" + String(str).replace(/'/g, "''").replace(/\\/g, '\\\\') + "'";
  };

  let sql = `-- ==============================================================================
-- CITY GOVERNMENT OF TACLOBAN - PRAISE MANAGEMENT SYSTEM
-- Program on Awards and Incentives for Service Excellence
-- Live Exported MySQL / MariaDB Dump for XAMPP
-- Generated: ${new Date().toISOString()}
-- Database: tacloban_praise_db
-- ==============================================================================

CREATE DATABASE IF NOT EXISTS \`tacloban_praise_db\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE \`tacloban_praise_db\`;

SET FOREIGN_KEY_CHECKS = 0;

-- ------------------------------------------------------------------------------
-- Table: offices
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS \`offices\`;
CREATE TABLE \`offices\` (
  \`id\` VARCHAR(64) NOT NULL,
  \`name\` VARCHAR(255) NOT NULL,
  \`code\` VARCHAR(50) NOT NULL UNIQUE,
  \`head_name\` VARCHAR(255) NOT NULL,
  \`head_title\` VARCHAR(255) NOT NULL,
  \`is_active\` TINYINT(1) NOT NULL DEFAULT 1,
  \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

`;

  // Offices Data
  if (data.offices.length > 0) {
    sql += `INSERT INTO \`offices\` (\`id\`, \`name\`, \`code\`, \`head_name\`, \`head_title\`, \`is_active\`) VALUES\n`;
    const officeRows = data.offices.map(o => 
      `(${escapeSql(o.id)}, ${escapeSql(o.name)}, ${escapeSql(o.code)}, ${escapeSql(o.head_name)}, ${escapeSql(o.head_title)}, ${o.is_active ? 1 : 0})`
    );
    sql += officeRows.join(',\n') + ';\n\n';
  }

  // Profiles
  sql += `-- ------------------------------------------------------------------------------
-- Table: profiles
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS \`profiles\`;
CREATE TABLE \`profiles\` (
  \`id\` VARCHAR(64) NOT NULL,
  \`email\` VARCHAR(255) NOT NULL UNIQUE,
  \`full_name\` VARCHAR(255) NOT NULL,
  \`role\` ENUM('ADMINISTRATOR', 'SECRETARIAT', 'HEAD_OF_OFFICE', 'EVALUATOR', 'NOMINEE') NOT NULL,
  \`office_id\` VARCHAR(64) DEFAULT NULL,
  \`office_name\` VARCHAR(255) DEFAULT NULL,
  \`position_title\` VARCHAR(255) DEFAULT NULL,
  \`employee_id\` VARCHAR(50) DEFAULT NULL,
  \`contact_number\` VARCHAR(50) DEFAULT NULL,
  \`barangay\` VARCHAR(255) DEFAULT NULL,
  \`avatar_url\` VARCHAR(500) DEFAULT NULL,
  \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

`;

  if (data.users.length > 0) {
    sql += `INSERT INTO \`profiles\` (\`id\`, \`email\`, \`full_name\`, \`role\`, \`office_id\`, \`office_name\`, \`position_title\`, \`employee_id\`, \`contact_number\`, \`barangay\`) VALUES\n`;
    const userRows = data.users.map(u => 
      `(${escapeSql(u.id)}, ${escapeSql(u.email)}, ${escapeSql(u.full_name)}, ${escapeSql(u.role)}, ${escapeSql(u.office_id)}, ${escapeSql(u.office_name)}, ${escapeSql(u.position_title)}, ${escapeSql(u.employee_id)}, ${escapeSql(u.contact_number)}, ${escapeSql(u.barangay)})`
    );
    sql += userRows.join(',\n') + ';\n\n';
  }

  // Awards
  sql += `-- ------------------------------------------------------------------------------
-- Table: awards
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS \`awards\`;
CREATE TABLE \`awards\` (
  \`id\` VARCHAR(64) NOT NULL,
  \`name\` VARCHAR(255) NOT NULL,
  \`code\` VARCHAR(50) NOT NULL UNIQUE,
  \`description\` TEXT DEFAULT NULL,
  \`award_year\` INT NOT NULL DEFAULT 2026,
  \`min_qualifying_score\` DECIMAL(5,2) NOT NULL DEFAULT 85.00,
  \`is_active\` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

`;

  if (data.awards.length > 0) {
    sql += `INSERT INTO \`awards\` (\`id\`, \`name\`, \`code\`, \`description\`, \`award_year\`, \`min_qualifying_score\`, \`is_active\`) VALUES\n`;
    const awardRows = data.awards.map(a => 
      `(${escapeSql(a.id)}, ${escapeSql(a.name)}, ${escapeSql(a.code)}, ${escapeSql(a.description)}, ${a.award_year || 2026}, ${a.min_qualifying_score || 85.00}, ${a.is_active ? 1 : 0})`
    );
    sql += awardRows.join(',\n') + ';\n\n';
  }

  // Applications
  sql += `-- ------------------------------------------------------------------------------
-- Table: applications
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS \`applications\`;
CREATE TABLE \`applications\` (
  \`id\` VARCHAR(64) NOT NULL,
  \`application_number\` VARCHAR(64) NOT NULL UNIQUE,
  \`award_id\` VARCHAR(64) NOT NULL,
  \`award_name\` VARCHAR(255) NOT NULL,
  \`award_year\` INT NOT NULL DEFAULT 2026,
  \`nominee_id\` VARCHAR(64) DEFAULT NULL,
  \`nominee_name\` VARCHAR(255) NOT NULL,
  \`employee_id\` VARCHAR(50) DEFAULT NULL,
  \`position_title\` VARCHAR(255) NOT NULL,
  \`office_id\` VARCHAR(64) DEFAULT NULL,
  \`office_name\` VARCHAR(255) NOT NULL,
  \`division_section\` VARCHAR(255) DEFAULT NULL,
  \`employment_category\` VARCHAR(100) NOT NULL,
  \`contact_number\` VARCHAR(50) NOT NULL,
  \`email\` VARCHAR(255) NOT NULL,
  \`barangay\` VARCHAR(255) DEFAULT NULL,
  \`nomination_type\` VARCHAR(50) NOT NULL DEFAULT 'Individual',
  \`nominator_id\` VARCHAR(64) DEFAULT NULL,
  \`nominator_name\` VARCHAR(255) NOT NULL,
  \`nominator_position\` VARCHAR(255) NOT NULL,
  \`nominating_office\` VARCHAR(255) NOT NULL,
  \`justification\` TEXT NOT NULL,
  \`accomplishments\` TEXT NOT NULL,
  \`supporting_narrative\` TEXT NOT NULL,
  \`date_of_nomination\` DATE NOT NULL,
  \`status\` VARCHAR(50) NOT NULL DEFAULT 'Submitted',
  \`processing_stage\` VARCHAR(50) NOT NULL DEFAULT 'Submitted',
  \`required_action\` TEXT DEFAULT NULL,
  \`remarks\` TEXT DEFAULT NULL,
  \`final_weighted_score\` DECIMAL(5,2) DEFAULT NULL,
  \`deliberation_decision\` ENUM('Approved', 'Not Approved') DEFAULT NULL,
  \`deliberation_remarks\` TEXT DEFAULT NULL,
  \`deliberation_date\` DATE DEFAULT NULL,
  \`award_date\` DATE DEFAULT NULL,
  \`assigned_evaluators\` JSON DEFAULT NULL,
  \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

`;

  if (data.applications.length > 0) {
    sql += `INSERT INTO \`applications\` (
  \`id\`, \`application_number\`, \`award_id\`, \`award_name\`, \`award_year\`, \`nominee_id\`, \`nominee_name\`,
  \`employee_id\`, \`position_title\`, \`office_id\`, \`office_name\`, \`division_section\`, \`employment_category\`,
  \`contact_number\`, \`email\`, \`barangay\`, \`nomination_type\`, \`nominator_id\`, \`nominator_name\`, \`nominator_position\`,
  \`nominating_office\`, \`justification\`, \`accomplishments\`, \`supporting_narrative\`, \`date_of_nomination\`,
  \`status\`, \`processing_stage\`, \`required_action\`, \`remarks\`, \`final_weighted_score\`, \`deliberation_decision\`,
  \`deliberation_remarks\`, \`deliberation_date\`, \`award_date\`, \`assigned_evaluators\`
) VALUES\n`;

    const appRows = data.applications.map(app => {
      const evalsJson = escapeSql(JSON.stringify(app.assigned_evaluators || []));
      return `(${escapeSql(app.id)}, ${escapeSql(app.application_number)}, ${escapeSql(app.award_id)}, ${escapeSql(app.award_name)}, ${app.award_year || 2026}, ${escapeSql(app.nominee_id)}, ${escapeSql(app.nominee_name)}, ${escapeSql(app.employee_id)}, ${escapeSql(app.position_title)}, ${escapeSql(app.office_id)}, ${escapeSql(app.office_name)}, ${escapeSql(app.division_section)}, ${escapeSql(app.employment_category)}, ${escapeSql(app.contact_number)}, ${escapeSql(app.email)}, ${escapeSql(app.barangay)}, ${escapeSql(app.nomination_type)}, ${escapeSql(app.nominator_id)}, ${escapeSql(app.nominator_name)}, ${escapeSql(app.nominator_position)}, ${escapeSql(app.nominating_office)}, ${escapeSql(app.justification)}, ${escapeSql(app.accomplishments)}, ${escapeSql(app.supporting_narrative)}, ${escapeSql(app.date_of_nomination)}, ${escapeSql(app.status)}, ${escapeSql(app.processing_stage)}, ${escapeSql(app.required_action)}, ${escapeSql(app.remarks)}, ${app.final_weighted_score || 'NULL'}, ${escapeSql(app.deliberation_decision)}, ${escapeSql(app.deliberation_remarks)}, ${escapeSql(app.deliberation_date)}, ${escapeSql(app.award_date)}, ${evalsJson})`;
    });

    sql += appRows.join(',\n') + ';\n\n';
  }

  sql += `SET FOREIGN_KEY_CHECKS = 1;\n`;
  return sql;
}

/**
 * Trigger file download in browser
 */
export function downloadFile(content: string, filename: string, mimeType: string = 'text/plain') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
