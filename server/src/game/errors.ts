export class IllegalActionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'IllegalActionError';
    }
}

export class NotYourTurnError extends IllegalActionError {
    constructor() {
        super('It is not your turn');
    }
}
