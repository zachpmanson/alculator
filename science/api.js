const https = require("https");
const fs = require("fs");

const nresults = +process.argv[2] || 1000;

// for Dan Murphy's fuck ups, uses product stock code
const blacklist = JSON.parse(fs.readFileSync("blacklist.json"));

function saveJSON(name, data) {
  console.log(`Saving ${data.length} items to ${name}.json`);
  fs.writeFile(`${name}.json`, JSON.stringify(data), (err) => {
    if (err) {
      console.log(err);
    }
  });
}

/**
 * Hits DM API and saves JSON reponse to file
 * @param {*} name name for output file and logging
 * @param {*} department
 * @param {*} subdepartment
 */
function saveCans(name, department, subdepartment) {
  const data = JSON.stringify({
    department: department,
    filters: [],
    pageNumber: 1,
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

  console.log(`Sending http request (${name})`);

  const req = https
    .request(options, (res) => {
      let data = "";

      console.log(`Response: ${res.statusCode} (${name})`);

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        let bundles = JSON.parse(data).Bundles;
        let cans = bundles.map((bundle) => {
          const product = bundle.Products[0];
          if (blacklist.includes(product.Stockcode)) return;

          let caseprice = +product.Prices.caseprice?.Value;
          let promocaseprice = +bundle.Products[0].Prices.caseprice?.AfterPromotion;
          let packprice = 0;
          let promopackprice = 0;
          let bottleprice = +product.Prices.inanysixprice?.Value;
          let promobottleprice = +product.Prices.inanysixprice?.AfterPromotion;

          if (typeof product.Prices.singleprice?.PackType !== undefined) {
            if (product.Prices.singleprice?.PackType === "Pack") {
              packprice = +product.Prices.singleprice?.Value;
              promopackprice = +product.Prices.singleprice?.AfterPromotion;
            } else if (product.Prices.singleprice?.PackType === "Bottle") {
              bottleprice = +product.Prices.singleprice?.Value;
              promobottleprice = +product.Prices.singleprice?.AfterPromotion;
            }
          }

          return {
            name: product.AdditionalDetails.find((r) => r.Name === "producttitle")?.Value,
            stockcode: product.Stockcode,
            prices: {
              // add packsize and casesize
              pack: packprice,
              bottle: bottleprice,
              case: caseprice,
              promopack: promopackprice,
              promobottle: promobottleprice,
              promocase: promocaseprice,
            },
            strength: +product.AdditionalDetails.find((r) => r.Name === "standarddrinks")?.Value,
            percentage: product.AdditionalDetails.find((r) => r.Name === "webalcoholpercentage")?.Value,
          };
        });

        // console.log(cans);
        saveJSON(name, cans);
      });
    })
    .on("error", (err) => {
      console.log("Error: ", err.message);
    });

  req.write(data);
  req.end();
}

saveCans("beer", "beer");
saveCans("cider", "cider");
saveCans("premix", "spirits", "premix drinks");
saveCans("spirit", "spirits");
