const https = require("https");
const fs = require("fs");

// Over 100 tends to fail because DM has an inefficient server
const nresults = +process.argv[2] || 100;

function saveJSON(name, data) {
  console.log(`Saving ${data.length} items to ${name}.json`);
  data = data.filter((d) => !!d);
  fs.writeFile(`${name}.json`, JSON.stringify(data), (err) => {
    if (err) console.log(err);
  });
}

function processBundle(bundle) {
  const product = bundle.Products[0];
  if (blacklist.includes(product.Stockcode)) return;

  let caseprice = +product.Prices.caseprice?.Value;
  let promocaseprice = +bundle.Products[0].Prices.caseprice?.AfterPromotion;
  let caseIntsInMessage = product.Prices.caseprice?.Message?.match(/([0-9]+)/);
  let caseunits = !!caseIntsInMessage ? +caseIntsInMessage[0] : 0;

  let packprice = 0;
  let promopackprice = 0;
  let packunits = 0;

  let bottleprice = +product.Prices.inanysixprice?.Value;
  let promobottleprice = +product.Prices.inanysixprice?.AfterPromotion;

  if (typeof product.Prices.singleprice?.PackType !== undefined) {
    if (product.Prices.singleprice?.PackType === "Pack") {
      packprice = +product.Prices.singleprice?.Value;
      promopackprice = +product.Prices.singleprice?.AfterPromotion;

      packIntsInMessage = product.Prices.singleprice?.Message?.match(/([0-9]+)/);
      packunits = !!packIntsInMessage ? +packIntsInMessage[0] : 0;
    } else if (product.Prices.singleprice?.PackType === "Bottle") {
      bottleprice = +product.Prices.singleprice?.Value;
      promobottleprice = +product.Prices.singleprice?.AfterPromotion;
    }
  }

  return {
    name: product.AdditionalDetails.find((r) => r.Name === "producttitle")?.Value,
    stockcode: product.Stockcode,
    units: {
      pack: packunits,
      case: caseunits,
    },
    prices: {
      bottle: bottleprice,
      pack: packprice,
      case: caseprice,
      promopack: promopackprice,
      promobottle: promobottleprice,
      promocase: promocaseprice,
    },
    standardDrinks: +product.AdditionalDetails.find((r) => r.Name === "standarddrinks")?.Value,
    percentage: product.AdditionalDetails.find((r) => r.Name === "webalcoholpercentage")?.Value,
  };
}

/**
 * Hits DM API and saves JSON reponse to file
 * @param {*} name name for output file and logging
 * @param {*} department
 * @param {*} subdepartment
 * @param {*} page page number to hit API with
 */
function saveDrinks(name, department, subdepartment, page = 1) {
  let queryID = `${name}-${department}${!!subdepartment ? "-" + subdepartment : ""}-${page}`;
  allQueriesStatus[queryID] = false;
  const data = JSON.stringify({
    department: department,
    filters: [],
    pageNumber: page,
    pageSize: nresults,
    sortType: "PriceAsc",
    Location: "ListerFacet",
    subDepartment: subdepartment,
    // PageUrl: `/${type}/all` // don't need
  });
  const options = {
    hostname: "api.danmurphys.com.au",
    path: "/apis/ui/Browse",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": data.length,
    },
  };

  console.log(`Sending http request (${queryID})`);

  const req = https
    .request(options, (res) => {
      let data = "";

      console.log(`Response: ${res.statusCode} (${queryID})`);

      if (res.statusCode !== 200) process.exit(1);

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        let bundles = JSON.parse(data).Bundles;
        console.log(`Received ${bundles.length} bundles (${queryID})`);
        if (bundles.length + 20 > nresults) {
          // recursive call, save more drinks if more drinks exist
          saveDrinks(name, department, subdepartment, page + 1);
        }
        let cans = bundles.map(processBundle);

        allDrinks[name].push(...cans);
        allQueriesStatus[queryID] = true;
        checkIfAllComplete();
      });
    })
    .on("error", (err) => {
      console.log("Error: ", err.message);
    });

  req.write(data);
  req.end();
}

function checkIfAllComplete() {
  let allQueriesComplete = Object.keys(allQueriesStatus).every((key) => allQueriesStatus[key]);
  if (allQueriesComplete) {
    Object.keys(allDrinks).forEach((key) => saveJSON(key, allDrinks[key]));
  }
}

// Stores actual values
let allDrinks = {
  beer: [],
  cider: [],
  premix: [],
  spirits: [],
  redwine: [],
  whitewine: [],
};

// Stores status of each API call
let allQueriesStatus = {};

// for Dan Murphy's fuck ups, uses product stock code
let blacklist = [];
fetch("https://alculator.zachmanson.com/api/blacklist")
  .then((response) => response.json())
  .then((jsonData) => {
    blacklist = jsonData;
    saveDrinks("beer", "beer", undefined, 1);
    saveDrinks("cider", "cider", undefined, 1);
    saveDrinks("premix", "spirits", "premix drinks", 1);
    saveDrinks("spirits", "spirits", undefined, 1);
    saveDrinks("spirits", "whisky", undefined, 1);
    saveDrinks("redwine", "red wine", undefined, 1);
    saveDrinks("whitewine", "white wine", undefined, 1);
  });
