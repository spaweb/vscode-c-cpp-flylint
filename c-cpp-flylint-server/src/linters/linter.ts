import * as which from 'which';
import * as fs from "fs";
import * as path from "path";
import { spawnSync } from 'child_process';
import { Settings } from "../settings";
import { isString } from 'util';

const substituteVariables = require('var-expansion').substituteVariables; // no types available
const slash = require('slash'); // no types available

export interface IExpansionResult {
    error?: any;
    result?: string;
}

export const headerExts = ['.h', '.H', '.hh', '.hpp', '.h++', '.hxx'];

export class Linter {
    protected name: string;
    protected settings: Settings;
    protected workspaceRoot: string;
    protected enabled: boolean;
    protected executable: string;
    protected configFile: string;
    protected requireConfig: boolean;

    protected constructor(name: string, settings: Settings, workspaceRoot: string, requireConfig: boolean) {
        this.name = name;
        this.settings = settings;
        this.workspaceRoot = workspaceRoot;
        this.requireConfig = requireConfig;
        this.enabled = true;
    }

    protected setExecutable(fileName: string) {
        this.executable = fileName;
    }

    protected setConfigFile(fileName: string) {
        this.configFile = fileName;
    }

    public enable() {
        this.enabled = true;
    }

    public disable() {
        this.enabled = false;
    }

    public initialize() {
        return this.maybeEnable()
            .then(() => {
                return this;
            })
            .catch(() => {
                return this;
            });
    }

    private maybeEnable() {
        return this.maybeExecutablePresent()
            .then((val) => {
                this.executable = val;

                return this.maybeConfigFilePresent();
            });
    }

    private maybeExecutablePresent(): Promise<string> {
        return new Promise((resolve, reject) => {
            which(this.executable, { path: process.cwd() }, (err, result) => {
                if (err) {
                    this.disable();

                    reject(Error(`The executable was not found for ${this.name}, disabling linter`));
                }
                else resolve(result);
            });
        });
    }

    private maybeConfigFilePresent(): Promise<string> {
        if (!this.requireConfig) {
            return Promise.resolve("");
        }

        return this.locateFile(this.workspaceRoot, this.configFile)
            .then((val) => {
                this.configFile = val;

                this.enable();

                return val;
            })
            .catch(() => {
                this.disable();

                throw Error(`could not locate configuration file for ${this.name}, disabling linter`);
            });
    }

    protected locateFile(directory: string, fileName: string): Promise<string> {
        return new Promise((resolve, reject) => {
            let parent = directory;

            do {
                directory = parent;

                const location = path.join(directory, fileName);

                try {
                    fs.accessSync(location, fs.constants.R_OK);
                    resolve(location);
                } catch (e) {
                    // do nothing
                }

                parent = path.dirname(directory);
            } while (parent !== directory);

            reject('could not locate file within project workspace');
        });
    }

    protected locateFiles(directory: string, fileName: string[]): Promise<string[]> {
        var locates : Array<Promise<string>>

        locates = []

        fileName.forEach(element => {
            locates.push(this.locateFile(directory, element));
        });

        return Promise.all(locates);
    }

    protected expandVariables(str: string): IExpansionResult {
        process.env.workspaceRoot = this.workspaceRoot;
        let { value, error } = substituteVariables(str, { env: process.env });

        if (error) {
            return { error: error };
        } else if (value === '') {
            return { error: `Expanding '${str}' resulted in an empty string.` };
        } else {
            return { result: slash(value) };
        }
    }

    protected buildCommandLine(fileName: string): string[] {
        return [this.executable, fileName];
    }

    protected runLinter(params: string[], workspaceDir: string) {
        let cmd = params.shift() || this.executable;

        console.log('executing: ', cmd, params);

        return spawnSync(cmd, params, { 'cwd': workspaceDir });
    }

    public lint(fileName: string, directory: null | string): {}[] {
        if (!this.enabled) { return []; }

        try {
            let result = this.runLinter(this.buildCommandLine(fileName), directory || this.workspaceRoot);
            let stdout = result.stdout !== null ? result.stdout.toString('utf-8').replace(/\r/g, "").split("\n") : [];
            let stderr = result.stderr !== null ? result.stderr.toString('utf-8').replace(/\r/g, "").split("\n") : [];

            console.log(stdout);
            console.log(stderr);

            if (result.status != 0) {
                console.log(`${this.name} exited with status code ${result.status}`);
            }

            return this.parseLines(stdout.concat(stderr));
        } catch(e) {
            console.log(`An exception occurred in ${this.name}: ${e}`);

            return [];
        }
    }

    protected parseLines(lines: string[]) {
        var results;
        var currentParsed;

        results = [];
        currentParsed = {};

        lines.forEach(line => {
            let parsed = this.parseLine(line);
            if (parsed !== {}) {
                ({currentParsed, parsed} = this.transformParse(currentParsed, parsed));

                if (currentParsed !== undefined && currentParsed.hasOwnProperty('fileName')) {
                    // output an entry
                    results.push(currentParsed);
                }

                currentParsed = parsed;
            }
        });

        return results;
    }

    protected transformParse(currentParsed: {[key:string]:any}, parsed: {[key:string]:any}) {
        return {currentParsed: currentParsed, parsed: parsed};
    }

    protected parseLine(line: string): {[key:string]:any} {
        line;
        return {};
    }
}