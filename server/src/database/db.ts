export default interface IDb {
    connect(): Promise<void>;
    getClient<T>(): T;
}
