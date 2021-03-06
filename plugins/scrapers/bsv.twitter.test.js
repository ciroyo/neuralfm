const assert = require("assert");
const core = require("../../core");
const plugins = require("../index");

assert(plugins);
assert(plugins.scrapers.BSVTwitterScraper);
const BSVTwitterScraper = plugins.scrapers.BSVTwitterScraper;

BSVTwitterScraper._getDatabaseName = BSVTwitterScraper.getDatabaseName;
BSVTwitterScraper.getDatabaseName = function() {
  if (BSVTwitterScraper._getDatabaseName().indexOf("Test") !== 0) {
    return `Test${BSVTwitterScraper._getDatabaseName()}`;
  }
  return BSVTwitterScraper._getDatabaseName();
}

describe("bsv twitter scraper", function () {

  beforeEach(async function() {

    await BSVTwitterScraper.resetDatabase();
    const db = await core.db(BSVTwitterScraper.getDatabaseName());
    await db.collection(BSVTwitterScraper.getUsernameCollectionName()).insertMany([
      {"username": "synfonaut"},
      {"username": "_unwriter"},
    ]);
    db.close();
  });

  it("verify plugin meta data", function () {
    assert.equal(BSVTwitterScraper.getDataset(), "BSV Twitter");
    assert.equal(BSVTwitterScraper.getAuthor(), "synfonaut");
    assert.equal(BSVTwitterScraper.getPaymail(), "synfonaut@moneybutton.com");
    assert(BSVTwitterScraper.getDescription());
    assert(BSVTwitterScraper.getVersion());
  });

  it("fetches recent tweets from user", function (done) {
    this.timeout(10000);
    this.slow(5000);
    const client = BSVTwitterScraper.getTwitterClient();
    BSVTwitterScraper.fetchRecentTweetsForTwitterAccount(client, "synfonaut").then(function (results) {
      assert(results);
      assert.equal(results.length, 10);
      assert(results[0].created_at);
      assert(results[0].id);
      assert(results[0].full_text);
      assert(results[0].user);
      assert(results[0].user.id);
      assert(results[0].fingerprint);
      done();
    });
  });

  it("syncs recent tweets from top users", async function () {
    this.timeout(10000);
    this.slow(5000);

    let opts = { limit: 5 };
    let db, usernames, results;

    // should have 2 users that need to be checked
    db = await core.db(BSVTwitterScraper.getDatabaseName());
    usernames = await BSVTwitterScraper.getTwitterUsernames(db);
    assert.equal(usernames.length, 2);

    let scrapers = [BSVTwitterScraper];

    results = await core.scrapers.scrape(scrapers, opts);
    assert.equal(results.length, 5);
    for (const result of results) { assert.equal(result.user.screen_name, "synfonaut") }

    results = await core.scrapers.scrape(scrapers, opts);
    assert.equal(results.length, 5);
    for (const result of results) { assert.equal(result.user.screen_name, "_unwriter") }

    results = await core.scrapers.scrape(scrapers, opts);
    assert.equal(results.length, 0);

    // no more twitter users to check
    db = await core.db(BSVTwitterScraper.getDatabaseName());
    usernames = await BSVTwitterScraper.getTwitterUsernames(db);
    assert.equal(usernames.length, 0);
  });
});

