const { addonBuilder } = require("stremio-addon-sdk");
const needle = require("needle");
const webshare = require("./webshare");
const { findShowInfo } = require("./meta");

// Docs: https://github.com/Stremio/stremio-addon-sdk/blob/master/docs/api/responses/manifest.md
const manifest = {
  id: "community.gabecko.webshare",
  version: "0.2.0",
  catalogs: [],
  resources: ["stream"],
  types: ["movie", "series"],
  name: "nicshare.cz",
  description: "Simple nicshare.cz search and streaming.",
  idPrefixes: ["tt"],
  behaviorHints: { configurable: true, configurationRequired: true },
  config: [
    {
      key: "login",
      type: "text",
      title: "nicshare.cz login - username or email",
      required: true,
    },
    {
      key: "password",
      type: "password",
      title: "nicshare.cz password",
      required: true,
    },
  ],
};
const builder = new addonBuilder(manifest);

builder.defineStreamHandler(async function (args) {
  const info = await findShowInfo(args.type, args.id);
  if (info) {
    const config = args.config || {};
    const wsToken = await webshare.login(config.login, config.password);
    const streams = await webshare.search(info, wsToken);
    const streamsWithUrl = await webshare.addUrlToStreams(streams, wsToken);

    return { streams: streamsWithUrl };
  }
  return { streams: [] };
});

module.exports = builder.getInterface();
