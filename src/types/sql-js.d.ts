/**
 * Type definitions for sql.js
 * These are basic type definitions for the sql.js library
 */

declare module 'sql.js' {
  interface SqlJsConfig {
    locateFile?: (file: string) => string;
  }

  interface Statement {
    run(params?: any[]): void;
    step(): boolean;
    getAsObject(): Record<string, any>;
    bind(params: any[]): void;
    free(): void;
  }

  interface Database {
    run(sql: string, params?: any[]): void;
    prepare(sql: string): Statement;
    export(): Uint8Array;
    close(): void;
    getRowsModified(): number;
  }

  interface SqlJs {
    Database: new (data?: Uint8Array) => Database;
  }

  function initSqlJs(config?: SqlJsConfig): Promise<SqlJs>;

  export = initSqlJs;
  export { Database, Statement, SqlJs, SqlJsConfig };
}
