const https = require("https");
const fs = require("fs");

// for Dan Murphy's fuck ups, uses product stock code
const blacklist = ["808932"];

function saveJSON(name, data) {
  console.log(`Saving file ${name}.json`);
  fs.writeFile(`${name}.json`, JSON.stringify(data), (err) => {
    if (err) {
      console.log(err);
    }
  });
}

/**
 * Gets all data for cans
 * @param {string} type beer | cider
 */
function saveCans(type) {
  const data = JSON.stringify({
    department: type,
    filters: [],
    pageNumber: 1,
    pageSize: 1000,
    sortType: "PriceAsc",
    Location: "ListerFacet",
    PageUrl: `/${type}/all`,
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

  console.log(`Sending http request (${type})`);

  const req = https
    .request(options, (res) => {
      let data = "";

      console.log(`Response: ${res.statusCode} (${type})`);

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        let bundles = JSON.parse(data).Bundles;
        let cans = bundles.map((bundle) => {
          if (blacklist.includes(bundle.Products[0].Stockcode)) return;

          return {
            name: bundle.Products[0].AdditionalDetails.find(
              (r) => r.Name === "producttitle"
            )?.Value,
            stockcode: bundle.Products[0].Stockcode,
            prices: {
              single: +bundle.Products[0].Prices.singleprice?.Value,
              sixpack: +bundle.Products[0].Prices.inanysixprice?.Value,
              case: +bundle.Products[0].Prices.caseprice?.Value,
              promosingle:
                +bundle.Products[0].Prices.singleprice?.AfterPromotion,
              promosixpack:
                +bundle.Products[0].Prices.inanysixprice?.AfterPromotion,
              promocase: +bundle.Products[0].Prices.caseprice?.AfterPromotion,
            },
            strength: +bundle.Products[0].AdditionalDetails.find(
              (r) => r.Name === "standarddrinks"
            )?.Value,
            percentage: bundle.Products[0].AdditionalDetails.find(
              (r) => r.Name === "webalcoholpercentage"
            )?.Value,
          };
        });

        // console.log(cans);
        saveJSON(type, cans);
      });
    })
    .on("error", (err) => {
      console.log("Error: ", err.message);
    });

  req.write(data);
  req.end();
}

saveCans("beer");
saveCans("cider");
