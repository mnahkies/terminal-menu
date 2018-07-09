import {EventEmitter} from 'events';
import through = require('through2');
import duplexer = require('duplexer2');
import createCharm = require('charm');

const visualwidth = require('visualwidth');

export default class Menu extends EventEmitter {

    private width: number;
    private x: number;
    private y: number;
    private init: { x: number, y: number };
    private items: any[];
    private lines: any;
    private selected: number;
    private colors: any;
    private padding: { left: number, right: number, top: number, bottom: number } = {
        left: 2,
        right: 2,
        top: 1,
        bottom: 1
    };
    private size: any;
    private _input: any;
    private _output: any;
    private charm: any;
    private stream: any;
    private _ticked: boolean;

    constructor(opts: any) {
        super();

        let self = this;
        self.width = opts.width || 50;
        self.x = opts.x || 1;
        self.y = opts.y || 1;
        self.init = {x: self.x, y: self.y};
        self.items = [];
        self.lines = {};
        self.selected = opts.selected || 0;
        self.colors = {
            fg: opts.fg || 'white',
            bg: opts.bg || 'blue'
        };

        if (opts.padding) {
            if (typeof opts.padding === 'number') {
                self.padding = {
                    left: opts.padding,
                    right: opts.padding,
                    top: opts.padding,
                    bottom: opts.padding
                };
            } else {
                self.padding = opts.padding;
            }
        }

        self.x += self.padding.left;
        self.y += self.padding.top;

        self.size = {
            x: self.width + self.padding.left + self.padding.right
        };

        self._input = through(
            function (buf, enc, next) {
                self._ondata(buf);
                next();
            },
            function () {
                self.emit('close')
            }
        );
        self._output = through();
        self.charm = opts.charm || createCharm({
            input: self._input
        } as any);
        self.charm.on('error', function () {
        });
        self.charm.pipe(self._output);

        self.stream = self.charm.pipe(through());

        try {
            self.charm.display('reset');
            self.charm.display('bright');
        }
        catch (e) {
        }

        process.nextTick(function () {
            self._ticked = true;
            self.charm.cursor(false);
            self._draw();
        });
    }

    createStream() {
        return duplexer(this._input, this._output);
    }

    add(label: string, cb?: Function) {
        let index = this.items.length;
        if (cb) {
            this.on('select', function (x, ix) {
                if (ix === index) cb(x, ix);
            });
        }

        this.items.push({
            x: this.x,
            y: this.y,
            label: label
        });
        this._fillLine(this.y);
        this.y++;
    }

    jump(name: string | number) {
        let index = typeof name === 'number'
            ? name
            : this.items
                .map(function (item) {
                    return item.label
                })
                .indexOf(name)
        ;
        if (index < 0) return;
        let prev = this.selected;
        this.selected = index;
        if (this._ticked) {
            this._drawRow(prev);
            this._drawRow(index);
        }
    }

    close() {
        this._input.end();
        this.charm.cursor(true);
        this.charm.display('reset');
        this.charm.position(1, this.y + 1);
        this.charm.end();
    }

    reset() {
        this.charm.reset();
        this.charm.display('reset');
        this.charm.display('bright');

        this.items = [];
        this.lines = {};

        this.x = this.init.x + this.padding.left;
        this.y = this.init.y + this.padding.top;

        process.nextTick(() => {
            this._ticked = true;
            this.charm.cursor(false);
            this._draw();
        });
    }

    write(msg: string) {
        this.charm.background(this.colors.bg);
        this.charm.foreground(this.colors.fg);
        this._fillLine(this.y);

        let parts = msg.split('\n');

        for (let i = 0; i < parts.length; i++) {
            if (parts[i].length) {
                this.charm.position(this.x, this.y);
                this.charm.write(parts[i]);
            }
            if (i !== parts.length - 1) {
                this.x = this.init.x + this.padding.left;
                this._fillLine(this.y);
                this.y++;
            }
        }
    }

    private _draw() {
        for (let i = 0; i < this.padding.top; i++) {
            this._fillLine(this.init.y + i);
        }

        for (let i = 0; i < this.items.length; i++) {
            this._drawRow(i);
        }

        // reset foreground and background colors
        this.charm.background(this.colors.bg);
        this.charm.foreground(this.colors.fg);

        for (let i = 0; i < this.padding.bottom; i++) {
            this._fillLine(this.y + i);
        }
    }

    private _fillLine(y: number) {
        if (!this.lines[y]) {
            this.charm.position(this.init.x, y);
            this.charm.write(Array(1 + this.size.x).join(' '));
            this.lines[y] = true;
        }
    }

    private _drawRow(index: number) {
        index = (index + this.items.length) % this.items.length;
        let item = this.items[index];
        this.charm.position(item.x, item.y);

        if (this.selected === index) {
            this.charm.background(this.colors.fg);
            this.charm.foreground(this.colors.bg);
        } else {
            this.charm.background(this.colors.bg);
            this.charm.foreground(this.colors.fg);
        }

        let len = this.width - visualwidth.width(item.label, true) + 1;
        this.charm.write(item.label + Array(Math.max(0, len)).join(' '));
    }

    private _ondata(buf: Buffer) {
        let bytes = [].slice.call(buf);
        while (bytes.length) {
            let codes = [].join.call(bytes, '.');

            if (/^(27.91.65|27,79.65|107|16)\b/.test(codes)) { // up or k
                this.selected = (this.selected - 1 + this.items.length)
                    % this.items.length;
                this._drawRow(this.selected + 1);
                this._drawRow(this.selected);

                if (/^107\b/.test(codes)) {
                    bytes.shift();
                } else {
                    bytes.splice(0, 3);
                }
            }

            if (/^(27.91.66|27.79.66|106|14)\b/.test(codes)) { // down or j
                this.selected = (this.selected + 1) % this.items.length;
                this._drawRow(this.selected - 1);
                this._drawRow(this.selected);

                if (/^106\b/.test(codes)) {
                    bytes.shift();
                } else {
                    bytes.splice(0, 3);
                }
            } else if (/^(3|113)/.test(codes)) { // ^C or q
                this.charm.reset();
                this._input.end();
                this._output.end();
                bytes.shift();
            } else if (/^(13|10)\b/.test(codes)) { // enter
                this.charm.position(1, this.items[this.items.length - 1].y + 2);
                this.charm.display('reset');
                this.emit('select', this.items[this.selected].label, this.selected);
                bytes.shift();
            } else {
                bytes.shift();
            }
        }
    }
}