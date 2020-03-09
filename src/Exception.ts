export default class Exception extends Error {
	private _cause: (Exception | null);

	constructor(message: (string | null) = null,
	            cause: (Exception | null) = null) {
		super(typeof(message) === "string" ? message : "");
		this.name = new.target.name;
		this.message = (typeof(message) === "string" ? message : "");
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(this as any)["__proto__"] = new.target.prototype;
		this._cause = (cause instanceof Exception ? cause : null);
	}

	get cause(): (Exception | null) {
		return this._cause;
	}
	initCause(cause: Exception): void {
		if(this._cause === null) {
			this._cause = cause;
		}
	}
}
