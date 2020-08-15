const log = require("debug")("neuralfm:core:scrape");
const database = require("../db").db;

const plugins = require("../../plugins");
const allScrapers = Object.values(plugins.scrapers);

export async function scrape(scrapers, opts={}) {
    log("scraping");
    for (const scraper of scrapers) {
        log(`scraping ${scraper.name}`);
        const dbname = scraper.getDatabaseName();
        const db = await database(dbname);
        const options = Object.assign({}, opts, { db });
        const instance = new scraper(db, options);
        const results = await instance.run();
        db.close();
        if (results && results.length > 0) {
            return results;
        }
    }
    return [];
}

export function isCompatible(scraper, extractor) {
    for (const compatiableExtractor of scraper.compatibleExtractors) {
        if (compatiableExtractor === extractor) {
            return true;
        }
    }
    return false;
}

export function getCompatible(extractor) {
    const compatible = [];
    for (const scraper of allScrapers) {
        if (scraper.compatibleExtractors.indexOf(extractor) !== -1) {
            compatible.push(scraper);
        }
    }
    return compatible;
}

if (require.main === module) {
    (async function() {
        const utils = require("../../utils");
        let results;
        do {
            results = await scrape(allScrapers);
            log("sleeping");
            await utils.sleep(1000);
        } while (results.length > 0);

        process.exit();
    })();

}
