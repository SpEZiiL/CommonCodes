import Exception from "@mfederczuk/custom-exception";

export abstract class DescriptionElement {
	abstract toString(): string;
}

export abstract class DescriptionInlineElement extends DescriptionElement {
	abstract toString(): string;
}
export namespace DescriptionInlineElement {
	export class TextSpan extends DescriptionInlineElement {
		readonly text: string;

		constructor(text: string) {
			super();

			if(text.includes("\n\n")) {
				throw new Exception("Text may not contain multiple line breaks in sequence");
			}

			// compress whitespace
			this.text = text.replace(/\s+/g, (substring) => (substring[0]));
		}

		toString(): string {
			return this.text;
		}
	}

	export class CommandSpan extends DescriptionInlineElement {
		constructor(readonly type: CommandSpan.Type, readonly textSpan: TextSpan) {
			super();
		}

		toString(): string {
			let str = "{" + this.type.getCommands()[0];

			const escapedText = this.textSpan.text.replace(/^[\\{}]$/g, (substring) => {
				return `\\${substring}`;
			});
			if(escapedText !== "") str += ` ${escapedText}`;

			return str + "}";
		}
	}
	export namespace CommandSpan {
		export class Type {
			private static _values: Type[] = [];

			private readonly commands: readonly string[];

			private constructor(ordinal: number,
			                    name: string,
			                    command: string);
			private constructor(ordinal: number,
			                    name: string,
			                    commands: string[]);
			private constructor(readonly ordinal: number,
			                    private readonly name: string,
			                    commandOrCommands: string | string[]) {
				if(typeof(commandOrCommands) === "string") {
					this.commands = [commandOrCommands];
				} else {
					this.commands = commandOrCommands;
				}

				Type._values.push(this);
			}

			getCommands(): readonly string[] {
				return this.commands;
			}

			toString(): string {
				return this.name;
			}

			static readonly EMPHASIS            = new Type(0, "EMPHASIS",            "e");
			static readonly STRONG_EMPHASIS     = new Type(1, "STRONG_EMPHASIS",     "s");
			static readonly PROPER_NAME         = new Type(2, "PROPER_NAME",         "p");
			static readonly CODE                = new Type(3, "CODE",                "c");
			static readonly MESSAGE             = new Type(4, "MESSAGE",             "m");
			static readonly MESSAGE_PLACEHOLDER = new Type(5, "MESSAGE_PLACEHOLDER", "mp");
			static readonly CURLY_BRACE_OPEN    = new Type(6, "CURLY_BRACE_OPEN",    ["cb", "cbo"]);
			static readonly CURLY_BRACE_CLOSED  = new Type(7, "CURLY_BRACE_CLOSED",  "cbc");

			static from(name: string): (Type | null) {
				for(const value of Type._values) {
					if(value.name === name) return value;
				}
				return null;
			}

			static fromCommand(command: string): (Type | null) {
				for(const value of Type._values) {
					if(value.commands.includes(command)) return value;
				}
				return null;
			}

			static values(): readonly Type[] {
				return Type._values;
			}
		}
	}
}

export abstract class DescriptionBlockElement extends DescriptionElement {
	abstract toString(): string;
}
export namespace DescriptionBlockElement {
	export class Paragraph extends DescriptionBlockElement {
		constructor(readonly elements: readonly DescriptionInlineElement[]) {
			super();
		}

		toString(): string {
			return "\n" + this.elements.join("") + "\n";
		}
	}

	export class List extends DescriptionBlockElement {
		constructor(readonly items: ReadonlyArray<readonly DescriptionInlineElement[]>) {
			super();
		}

		toString(): string {
			let str = "";

			const s = this.items.length;
			if(s > 0) str = "* " + this.items[0].join("").replace(/\n/, "\n  ");

			for(let i = 1; i < s; ++i) {
				str += "\n* " + this.items[i].join("").replace(/\n/, "\n  ");
			}

			return "\n" + str + "\n";
		}
	}
}

export class Description {
	constructor(readonly elements: readonly DescriptionBlockElement[]) {}

	toString(): string {
		return this.elements.join("").trim();
	}
}

/** parameter str shouldn't contain line breaks */
function parseInlineElementes(str: string): readonly DescriptionInlineElement[] {
	const elements: DescriptionInlineElement[] = [];

	let commandType: (DescriptionInlineElement.CommandSpan.Type | null) = null;
	let text = "";

	function pushTextSpan(): void {
		if(text !== "") {
			elements.push(new DescriptionInlineElement.TextSpan(text));
			text = "";
		}
	}

	const l = str.length;
	for(let i = 0; i < l; ) {
		const c = str[i];

		if(commandType === null && c === "{") {
			pushTextSpan();

			let commandStr = "";
			for(++i; i < l && (str[i].match(/^\s$/) === null) &&
			                  str[i] !== "}"; ++i) {
				commandStr += str[i];
			}

			if(commandStr === "") throw new Exception("Braces without command");

			// skip whitespace
			for(; i < l && (str[i].match(/^\s$/) !== null); ++i);

			commandType = DescriptionInlineElement.CommandSpan.Type.fromCommand(commandStr);
			if(commandType === null) {
				throw new Exception(`Unknown command "${commandStr}"`);
			}

			continue;
		}

		if(commandType !== null) {
			if(c === "}") {
				elements.push(new DescriptionInlineElement.CommandSpan(commandType, new DescriptionInlineElement.TextSpan(text)));
				commandType = null;
				text = "";

				++i;
				continue;
			}

			if(c === "\\" && i + 1 < l) {
				const escChar = str[i + 1];

				if(escChar === "\\" || escChar === "{" || escChar === "}") {
					text += escChar;
					i += 2;
					continue;
				}
			}
		}

		text += c;
		++i;
	}

	if(commandType !== null) throw new Exception("Unclosed command");
	pushTextSpan();

	return elements;
}

function optimizeElements(elements: readonly DescriptionInlineElement[]): readonly DescriptionInlineElement[] {
	const optimizedElements: DescriptionInlineElement[] = [];

	elements.forEach((element) => {
		const lastOptimizedElement = optimizedElements[optimizedElements.length - 1] as (DescriptionInlineElement | undefined);
		if(lastOptimizedElement === undefined) {
			optimizedElements.push(element);
			return; // continue forEach
		}

		if(element instanceof DescriptionInlineElement.TextSpan) {
			if(element.text !== "") {
				if(lastOptimizedElement instanceof DescriptionInlineElement.TextSpan) {
					optimizedElements[optimizedElements.length - 1] = new DescriptionInlineElement.TextSpan(lastOptimizedElement.text + element.text);
				} else {
					optimizedElements.push(element);
				}
			}
		} else {
			optimizedElements.push(element);
		}
	});

	return optimizedElements;
}

export function parseDescription(str: string): Description {
	str = str.trim().replace(/\n{3,}/g, "\n\n");

	const blocks: DescriptionBlockElement[] = [];

	str.split("\n\n").forEach((block) => {
		let paragraphElements = null as (DescriptionInlineElement[] | null);
		let listItems = null as (DescriptionInlineElement[][] | null);

		function pushParagraphElements(): void {
			if(paragraphElements !== null) {
				blocks.push(new DescriptionBlockElement.Paragraph(optimizeElements(paragraphElements)));
				paragraphElements = null;
			}
		}
		function pushListItems(): void {
			if(listItems !== null) {
				blocks.push(new DescriptionBlockElement.List(listItems.map(optimizeElements)));
				listItems = null;
			}
		}

		block.split("\n").forEach((line) => {
			if(line.startsWith("* ")) {
				pushParagraphElements();
				if(listItems === null) listItems = [];

				listItems.push([]);
				listItems[listItems.length - 1].push(...parseInlineElementes(line.substring(2)));
			} else if(listItems !== null && line.startsWith("  ")) {
				if(listItems[listItems.length - 1].length > 0 && !line.startsWith("   ")) {
					listItems[listItems.length - 1].push(new DescriptionInlineElement.TextSpan("\n"));
				}
				listItems[listItems.length - 1].push(...parseInlineElementes(line.substring(2)));
			} else {
				pushListItems();
				if(paragraphElements === null) paragraphElements = [];

				if(paragraphElements.length > 0 && !line.startsWith(" ")) {
					paragraphElements.push(new DescriptionInlineElement.TextSpan("\n"));
				}
				paragraphElements.push(...parseInlineElementes(line));
			}
		});

		pushParagraphElements();
		pushListItems();
	});

	return new Description(blocks);
}
