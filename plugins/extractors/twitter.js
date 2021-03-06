const log = require("debug")("neuralfm:plugins:extractors:twitter");
const utils = require("../../utils");

export class TwitterFeatureExtractor {

    constructor(db, scraper, opts={}) {
        if (!db) { throw "expected DB" }
        this.db = db;

        if (!scraper) { throw "expected scraper" }
        this.scraper = scraper;

        this.opts = opts;
    }

    async run() {
        const scraperName = this.scraper.constructor.name;
        log(`running feature extractor on ${scraperName}`);

        //const data = await this.scraper.getData();
        const collectionName = this.scraper.constructor.getCollectionName()
        const fieldName = TwitterFeatureExtractor.getFeaturesFieldName();

        const query = {};
        query[fieldName] = null;
        const tweets = await this.db.collection(collectionName).find(query).toArray();

        log(`found ${tweets.length} tweets that need feature extraction from ${scraperName}`);
        const results = [];
        for (const tweet of tweets) {
            results.push(await this.runFeatureExtractOnTweet(tweet));
        }

        return results;
    }

    async getDataCursor() {
        const fieldName = TwitterFeatureExtractor.getFeaturesFieldName();
        const collectionName = this.scraper.constructor.getCollectionName();
        const findQuery = {};
        findQuery[fieldName] = {"$exists": true};
        return await this.db.collection(collectionName).find(findQuery);
    }

    async getDataByFingerprints(fingerprints) {
        const collectionName = this.scraper.constructor.getCollectionName();
        return await (this.db.collection(collectionName).find({ "fingerprint": {"$in": fingerprints}}).toArray());
    }

    async runFeatureExtractOnTweet(tweet) {
        log(`extracting features from ${tweet.fingerprint}`);

        let text = tweet.full_text;
        if (tweet.retweeted_status) {
            text = tweet.retweeted_status.full_text;
        }

        if (tweet.quoted_status) {
            text = `${text} BOWTWITTERQUOTE ${tweet.quoted_status.full_text}`;
        }

        const features = {
            text,
            "likes": tweet.favorite_count,
            "retweets": tweet.retweet_count,
            "submitter": tweet.user.screen_name,
            "author": tweet.user.screen_name,
            "date": new Date(tweet.created_at),
            "fingerprint": tweet.fingerprint,
        };

        const collectionName = this.scraper.constructor.getCollectionName()
        const fieldName = TwitterFeatureExtractor.getFeaturesFieldName();

        const setQuery = {"$set": {}};
        setQuery["$set"][fieldName] = features;

        const response = await this.db.collection(collectionName).updateOne({"fingerprint": tweet.fingerprint}, setQuery);
        if (!utils.ok(response)) {
            log(`error saving extracted features on tweet ${tweet.fingerprint} - ${response}`);
            return tweet;
        }

        const assignQuery = {};
        assignQuery[fieldName] = features;
        const newTweet = Object.assign({}, tweet, assignQuery);

        return newTweet;
    }

    static getFeaturesFieldName() {
        return "twitter_features";
    }
}
