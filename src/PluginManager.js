"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("./fileSystem");
const path = require("path");
const NpmRegistryClient_1 = require("./NpmRegistryClient");
const PluginVm_1 = require("./PluginVm");
const Debug = require("debug");
const debug = Debug("live-plugin-manager");
const BASE_NPM_URL = "https://registry.npmjs.org";
const cwd = process.cwd();
const DefaultOptions = {
    npmRegistryUrl: BASE_NPM_URL,
    sandbox: {},
    npmRegistryConfig: {},
    pluginsPath: path.join(cwd, "plugins"),
    requireCoreModules: true,
    hostRequire: require
};
class PluginManager {
    constructor(options) {
        this.installedPlugins = new Array();
        this.options = Object.assign({}, DefaultOptions, options || {});
        this.vm = new PluginVm_1.PluginVm(this);
        this.npmRegistry = new NpmRegistryClient_1.NpmRegistryClient(this.options.npmRegistryUrl, this.options.npmRegistryConfig);
    }
    installFromNpm(name, version = "latest") {
        return __awaiter(this, void 0, void 0, function* () {
            yield fs.ensureDir(this.options.pluginsPath);
            const registryInfo = yield this.npmRegistry.get(name, version);
            // already installed
            const installedInfo = this.getInfo(name);
            if (installedInfo && installedInfo.version === registryInfo.version) {
                return installedInfo;
            }
            // already downloaded
            if (!(yield this.isAlreadyDownloaded(registryInfo.name, registryInfo.version))) {
                yield this.removeDownloaded(registryInfo.name);
                yield this.npmRegistry.download(this.options.pluginsPath, registryInfo);
            }
            return yield this.install(registryInfo);
        });
    }
    installFromPath(location) {
        return __awaiter(this, void 0, void 0, function* () {
            yield fs.ensureDir(this.options.pluginsPath);
            const packageJson = yield this.readPackageJson(location);
            // already installed
            const installedInfo = this.getInfo(packageJson.name);
            if (installedInfo && installedInfo.version === packageJson.version) {
                return installedInfo;
            }
            // already downloaded
            if (!(yield this.isAlreadyDownloaded(packageJson.name, packageJson.version))) {
                yield this.removeDownloaded(packageJson.name);
                debug(`Copy from ${location} to ${this.options.pluginsPath}`);
                yield fs.copy(location, this.getPluginLocation(packageJson.name));
            }
            return yield this.install(packageJson);
        });
    }
    uninstall(name) {
        return __awaiter(this, void 0, void 0, function* () {
            debug(`Uninstalling ${name}...`);
            const info = this.getInfo(name);
            if (!info) {
                debug(`${name} not installed`);
                return;
            }
            const index = this.installedPlugins.indexOf(info);
            if (index >= 0) {
                this.installedPlugins.splice(index, 1);
            }
            this.unload(info);
            yield fs.remove(info.location);
        });
    }
    uninstallAll() {
        return __awaiter(this, void 0, void 0, function* () {
            for (const plugin of this.installedPlugins.slice().reverse()) {
                yield this.uninstall(plugin.name);
            }
        });
    }
    list() {
        return __awaiter(this, void 0, void 0, function* () {
            return this.installedPlugins;
        });
    }
    require(name) {
        const info = this.getInfo(name);
        if (!info) {
            throw new Error(`${name} not installed`);
        }
        return info.instance;
    }
    getInfo(name) {
        return this.installedPlugins.find((p) => p.name === name);
    }
    installDependencies(packageInfo) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!packageInfo.dependencies) {
                return;
            }
            for (const key in packageInfo.dependencies) {
                if (packageInfo.dependencies.hasOwnProperty(key)) {
                    const version = packageInfo.dependencies[key].toString();
                    if (this.isModuleAvailableFromHost(key)) {
                        debug(`Installing dependencies of ${packageInfo.name}: ${key} is already installed`);
                    }
                    else {
                        debug(`Installing dependencies of ${packageInfo.name}: ${key} ...`);
                        yield this.installFromNpm(key, version);
                    }
                }
            }
        });
    }
    isModuleAvailableFromHost(name) {
        if (!this.options.hostRequire) {
            return false;
        }
        try {
            this.options.hostRequire.resolve(name);
            return true;
        }
        catch (e) {
            return false;
        }
    }
    getPluginLocation(name) {
        return path.join(this.options.pluginsPath, name);
    }
    removeDownloaded(name) {
        return __awaiter(this, void 0, void 0, function* () {
            const location = this.getPluginLocation(name);
            if (!(yield fs.exists(location))) {
                yield fs.remove(location);
            }
        });
    }
    isAlreadyDownloaded(name, version) {
        return __awaiter(this, void 0, void 0, function* () {
            const location = this.getPluginLocation(name);
            if (!(yield fs.exists(location))) {
                return false;
            }
            try {
                const packageJson = yield this.readPackageJsonFromPath(location);
                return (packageJson.name === name && packageJson.version === version);
            }
            catch (e) {
                return false;
            }
        });
    }
    readPackageJsonFromPath(location) {
        return __awaiter(this, void 0, void 0, function* () {
            const packageJsonFile = path.join(location, "package.json");
            if (!(yield fs.exists(packageJsonFile))) {
                throw new Error(`Invalid plugin ${location}, package.json is missing`);
            }
            const packageJson = JSON.parse(yield fs.readFile(packageJsonFile, "utf8"));
            if (!packageJson.name
                || !packageJson.version) {
                throw new Error(`Invalid plugin ${location}, 'main', 'name' and 'version' properties are required in package.json`);
            }
            return packageJson;
        });
    }
    load(plugin) {
        plugin.instance = this.vm.load(plugin, plugin.mainFile);
    }
    unload(plugin) {
        plugin.instance = undefined;
    }
    install(packageInfo) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.installDependencies(packageInfo);
            const DefaultMainFile = "index.js";
            const DefaultMainFileExtension = ".js";
            const location = this.getPluginLocation(packageInfo.name);
            const pluginInfo = {
                name: packageInfo.name,
                version: packageInfo.version,
                location,
                mainFile: path.normalize(path.join(location, packageInfo.main || DefaultMainFile))
            };
            // If no extensions for main file is used, just default to .js
            if (!path.extname(pluginInfo.mainFile)) {
                pluginInfo.mainFile += DefaultMainFileExtension;
            }
            this.load(pluginInfo);
            this.installedPlugins.push(pluginInfo);
            return pluginInfo;
        });
    }
}
exports.PluginManager = PluginManager;
//# sourceMappingURL=PluginManager.js.map