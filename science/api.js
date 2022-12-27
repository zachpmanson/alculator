const https = require("https");
const fs = require("fs");

const data = JSON.stringify({
  department: "cider",
  filters: [],
  pageNumber: 1,
  pageSize: 100,
  sortType: "PriceAsc",
  Location: "ListerFacet",
  PageUrl: "/cider/all",
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

const req = https
  .request(options, (res) => {
    let data = "";

    console.log("Status Code:", res.statusCode);

    res.on("data", (chunk) => {
      data += chunk;
    });

    res.on("end", () => {
      //   console.log("Body: ", JSON.parse(data));
      let bundles = JSON.parse(data).Bundles;
      let beers = bundles.map((bundle) => {
        return {
          name: bundle.Products[0].AdditionalDetails.find(
            (r) => r.Name === "producttitle"
          )?.Value,
          price: +bundle.Products[0].Prices.inanysixprice?.Value,
          strength: +bundle.Products[0].AdditionalDetails.find(
            (r) => r.Name === "standarddrinks"
          )?.Value,
          percentage: bundle.Products[0].AdditionalDetails.find(
            (r) => r.Name === "webalcoholpercentage"
          )?.Value,
        };
      });
      // console.log("Body: ", bundles);
      // console.log(`Got ${bundles.length} bundles`);
      // console.log(`First:`, bundles[0]);
      //   console.log(`Prices:`, bundles[0].Products[0].Prices);
      //   console.log(`Strength:`, bundles[0].Products[0].AdditionalDetails);
      // for (let bundle of bundles) {
      //   console.log("Name", bundle.Name);
      //   console.log("\tPrice", bundle.Products[0].Prices.inanysixprice?.Value);
      //   console.log(
      //     `\tStrength:`,
      //     bundle.Products[0].AdditionalDetails.filter(
      //       (r) => r.Name === "standarddrinks"
      //     )[0].Value
      //   );
      // }
      // console.log(bundles);

      console.log(beers);
      fs.writeFile("cider.json", JSON.stringify(beers), (err) => {
        if (err) {
          console.log(err);
        }
      });
    });
  })
  .on("error", (err) => {
    console.log("Error: ", err.message);
  });

req.write(data);
req.end();
