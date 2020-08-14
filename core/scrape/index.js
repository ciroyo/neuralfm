const log = require("debug")("neuralfm:core:scrape");
const database = require("../db").db;

async function scrape(scrapers, opts={}) {
    log("scraping");
    for (const scraper of scrapers) {
        log(`scraping ${scraper.name}`);
        const dbname = scraper.dbname || scraper.name;
        const db = await database(dbname);
        const options = Object.assign({}, opts, { db });
        const results = await scraper(db, options);
        db.close();
        if (results && results.length > 0) {
            return results;
        }
    }
    return [];
}

module.exports = scrape;

if (require.main === module) {
    (async function() {
        const utils = require("../../utils");
        const plugins = require("../../plugins");

        const scrapers = Object.values(plugins.scrapers);
        let results;
        do {
            results = await scrape(scrapers);
            log("sleeping");
            await utils.sleep(1000);
        } while (results.length > 0);

        process.exit();
    })();

}
