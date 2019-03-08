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
 
    (async () => {
      const browser = await puppeteer.launch({ headless: true });
      const page = await browser.newPage();
      await page.goto("http://localhost:3000/?puppeteer=true");
      const override = Object.assign(page.viewport(), { width: 1366 });
      await page.setViewport(override);
      
      await setTimeout(null, 35)
      await browser.close();
    })();

    res.json("OK");
  });
  return api;
};
