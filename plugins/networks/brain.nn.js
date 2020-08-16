const log = require("debug")("neuralfm:plugins:networks:brainnn");
const config = require("../../config");
const utils = require("../../utils");
const database = require("../../core/db").db;

const brain = require("brain.js");

export class BrainNeuralNetwork {
    constructor(scraper, extractor, normalizer, classifier, opts={}) {
        if (!scraper) { throw "expected scraper" }
        if (!extractor) { throw "expected extractor" }
        if (!normalizer) { throw "expected normalizer" }
        if (!classifier) { throw "expected classifier" }

        this.scraper = scraper;
        this.extractor = extractor;
        this.normalizer = normalizer;
        this.classifier = classifier;

        this.nn = null;
        this.isDirty = true;
        this.normalizationMetadata = null;
        this.classifications = null;
        this.data = null;
        this.trainingData = null;
        this.trainedDate = null;
        this.fingerprint = null;

        this.trainingOptions = (opts.trainingOptions ? opts.trainingOptions : BrainNeuralNetwork.getDefaultTrainingOptions());
        this.networkOptions = (opts.networkOptions ? opts.networkOptions : BrainNeuralNetwork.getDefaultNeuralNetworkOptions());

        this.name = `${this.scraper.constructor.name}:${this.extractor.constructor.name}:${this.normalizer.constructor.name}:${this.classifier.name}`;
    }

    async run() {
        this.classifications = await this.classifier.getClassifications();
        if (this.classifications.length == 0) {
            log(`no classifications to train ${this.name}`);
            return;
        }

        this.data = await this.normalizer.getDataSource();

        this.normalizationMetadata = await this.normalizer.getOrCreateMetadata(this.data);

        if (this.nn) {
            log(`reusing existing neural network`);
        } else {
            this.nn = this.createNeuralNetwork();
        }

        this.trainingData = await this.normalizer.getTrainingData(this.classifier, this.data);

        log(`training ${this.name} on ${this.trainingData.length} classifications (${this.data.length} data)`);
        const starttime = Date.now();
        this.nn.train(this.trainingData, this.trainingOptions);
        const endtime = Date.now();
        log(`finished training ${this.name} in ${(endtime-starttime) / 1000}s`);

        this.isDirty = false;
        this.trainedDate = new Date();
        this.fingerprint = `${this.name}:${Object.keys(this.classifications).length}:${this.trainedDate.getTime()}`;
    }

    predict(input) {
        if (!this.nn) { throw "expected neural network to be trained to predict" }
        if (this.isDirty) {
            log(`warning: neural network is dirty and needs to be re-trained to reflect most recent classifications`);
        }

        return this.nn.run(input)[0];
    }

    reset() {
        this.nn = null;
        this.isDirty = true;
        this.normalizationMetadata = null;
        this.classifications = null;
        this.data = null;
        this.trainingData = null;
        this.trainedDate = null;
        this.fingerprint = null;
    }

    createNeuralNetwork(options=null) {
        if (!options) {
            options = this.networkOptions;
        }

        log(`creating new neural network with options ${JSON.stringify(options)}`);
        return new brain.NeuralNetwork(options);
    }

    async toJSON() {
        if (!this.nn || !this.classifications) { throw "expected nn and classifications" }

        const classifications = await this.classifier.getClassificationMapping(this.classifications);
        const neuralnetwork = this.nn.toJSON();

        return {
            fingerprint: this.fingerprint,
            name: this.fingerprint,
            networkOptions: this.networkOptions,
            trainingOptions: this.trainingOptions,
            scraper: this.scraper.constructor.name,
            extractor: this.extractor.constructor.name,
            normalizer: this.normalizer.constructor.name,
            classifier: this.classifier.name,
            network: BrainNeuralNetwork.name,
            neuralnetwork,
            classifications,
            normalizationMetadata: this.normalizationMetadata,
            trainingData: this.trainingData,
            trainedDate: this.trainedDate,
            createdDate: new Date(),
        }
    }

    async save() {
        const obj = await this.toJSON();

        const db = await database(BrainNeuralNetwork.getDatabaseName());
        try {
            const response = await db.collection(BrainNeuralNetwork.getCollectionName()).insertOne(obj);
            if (!utils.ok(response)) {
                throw "invalid response"
            }

            log(`successfully saved network ${obj.fingerprint}`);

            return obj.fingerprint;
        } catch (e) {
            log(`error saving network ${obj.fingerprint} - ${resonse}`);
            throw e;
        } finally {
            db.close();
        }
    }

    static async getFromFingerprint(fingerprint) {
        const db = await database(BrainNeuralNetwork.getDatabaseName());
        const network = await db.collection(BrainNeuralNetwork.getCollectionName()).findOne({ fingerprint });
        if (!network) { throw `error finding network with fingerprint ${fingerprint}` }

        return network;
    }

    /*
    static async loadFromFingerprint(fingerprint) {
        const db = await database(BrainNeuralNetwork.getDatabaseName());
        const network = await db.collection(BrainNeuralNetwork.getCollectionName()).findOne({ fingerprint });
        if (!network) { throw `error finding network with fingerprint ${fingerprint}` }

        console.log("PLUGINS", plugins);

        const scraper = plugins.scrapers[network.scraper];
        if (!scraper) { throw `error finding scraper ${network.scraper} for fingerprint ${fingerprint}` }

        console.log(scraper);
        throw "BLAM";
    }
    */

    static getDefaultNeuralNetworkOptions() {
        return {
            binaryThresh: 0.5,
            hiddenLayers: [10, 5],
            activation: 'sigmoid',
        };
    }

    static getDefaultTrainingOptions() {
        /*
            iterations: 20000,    // the maximum times to iterate the training data --> number greater than 0
            errorThresh: 0.005,   // the acceptable error percentage from training data --> number between 0 and 1
            log: false,           // true to use console.log, when a function is supplied it is used --> Either true or a function
            logPeriod: 10,        // iterations between logging out --> number greater than 0
            learningRate: 0.3,    // scales with delta to effect training rate --> number between 0 and 1
            momentum: 0.1,        // scales with next layer's change value --> number between 0 and 1
            callback: null,       // a periodic call back that can be triggered while training --> null or function
            callbackPeriod: 10,   // the number of iterations through the training data between callback calls --> number greater than 0
            timeout: Infinity
        */

        return {
            iterations: 10000,
            errorThresh: 0.005,
            callback: (stats={}) => {
                log(`training iterations=${stats.iterations} error=${stats.error} for ${this.name}`);
            },
            callbackPeriod: 100,
        }
    }

    static getCollectionName() {
        return config.networkCollectionName;
    }

    static getDatabaseName() {
        return config.databaseName;
    }

    static async createIndexes(db) {
        await db.collection(this.getCollectionName()).createIndex({ "fingerprint": 1 }, {"unique": true});
    }

    static async resetDatabase() {
        const db = await database(this.getDatabaseName());
        await db.collection(this.getCollectionName()).deleteMany({});
        await BrainNeuralNetwork.createIndexes(db);
        db.close();
    }
}
