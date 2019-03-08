import { version } from "../../package.json";
import { Router } from "express";
import facets from "./facets";
import puppeteer from "puppeteer";
import { record } from "puppeteer-recorder";

export default ({ config, db }) => {
  let api = Router();

  // mount the facets resource
  api.use("/facets", facets({ config, db }));

  // perhaps expose some API metadata at the root
  api.get("/test", (req, res) => {
    res.json({ version });
  });

  api.get("/render", (req, res) => {
    const puppeteer = require("puppeteer");
    let countFrames = 0;
    (async () => {
      const browser = await puppeteer.launch({ headless: true });
      const page = await browser.newPage();
      await page.goto("http://localhost:3000/?puppeteer=true");
      const override = Object.assign(page.viewport(), { width: 1366 });
      await page.setViewport(override);
      await record({
        browser: browser, // Optional: a puppeteer Browser instance,
        page: page, // Optional: a puppeteer Page instance,
        output: "output.webm",
        fps: 30,
        frames: 60 * 35, // 5 seconds at 60 fps
        prepare: function(browser, page) {
          /* executed before first capture */
        },
        render: function(browser, page, frame) {
          /* executed before each capture */
          countFrames++;
          console.log(countFrames);
        }
      });

      await browser.close();
    })();

    res.json("OK");
  });
  return api;
};
