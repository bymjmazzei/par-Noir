declare module 'orbit-db' {
  export interface OrbitDB {
    open(name: string): Promise<any>;
    close(): Promise<void>;
    drop(): Promise<void>;
    load(): Promise<void>;
  }

  export interface OrbitDBInstance {
    open(name: string): Promise<any>;
    close(): Promise<void>;
    drop(): Promise<void>;
    load(): Promise<void>;
    docs(name: string, options?: any): Promise<any>;
  }

  export interface OrbitDBClass {
    createInstance(ipfs: any): Promise<OrbitDBInstance>;
  }

  const OrbitDB: OrbitDBClass;
  export default OrbitDB;
}
