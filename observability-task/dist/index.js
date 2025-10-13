"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const prom_client_1 = __importDefault(require("prom-client"));
const app = (0, express_1.default)();
const PORT = 3000;
const collectDefaultMetrics = prom_client_1.default.collectDefaultMetrics;
collectDefaultMetrics({
    register: prom_client_1.default.register,
});
app.get("/metrics", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    res.setHeader("Content-Type", prom_client_1.default.register.contentType);
    res.send(yield prom_client_1.default.register.metrics());
}));
app.get("/", (req, res) => {
    res.send("Hello World");
});
app.get("/heavy", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const timeTaken = yield getSomeHeavyComputation();
        return res.json({
            status: "success",
            message: `Heavy Task completed in ${timeTaken}ms`,
        });
    }
    catch (error) {
        console.error(error);
        const message = error instanceof Error ? error.message : String(error);
        return res.status(500).json({
            status: "error",
            message: "Heavy Task failed",
            error: message,
        });
    }
}));
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
function getSomeHeavyComputation() {
    return __awaiter(this, void 0, void 0, function* () {
        const ms = getRandomValue([100, 150, 200, 250, 300, 350, 400, 450, 500]);
        const shouldThrowError = getRandomValue([1, 2, 3, 4, 5, 6, 7, 8, 9]) === 8;
        if (shouldThrowError) {
            const randomError = getRandomValue([
                "DB_ERROR",
                "NETWORK_ERROR",
                "TIMEOUT_ERROR",
                "UNKNOWN_ERROR",
            ]);
            throw new Error(randomError);
        }
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve(ms);
            }, ms);
        });
    });
}
function getRandomValue(values) {
    return values[Math.floor(Math.random() * values.length)];
}
