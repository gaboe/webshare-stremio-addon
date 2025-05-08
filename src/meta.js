let tmdbApiKey;
try {
  // Attempt to load from the config file
  const config = require("../config/keys");
  if (config && typeof config.tmdbApiKey !== "undefined") {
    tmdbApiKey = config.tmdbApiKey;
  }
} catch (e) {
  // Log an info message if the file is problematic, but don't treat it as a critical error yet
  console.info(
    "Info: Could not load TMDB API key from '../config/keys'. Will attempt to use environment variable.",
    e.message
  );
}

// If not found or empty from the file, try the environment variable
if (!tmdbApiKey) {
  tmdbApiKey = process.env.TMDB_API_KEY;
}

// Add a warning if the key is ultimately not found from any source
if (!tmdbApiKey) {
  console.warn(
    "Warning: TMDB API Key is not configured. Please set it in ../config/keys.js or as TMDB_API_KEY environment variable. API calls to TMDB may fail."
  );
} else {
  console.log("TMDB API Key found");
}

const needle = require("needle");

const findShowInfo = async (type, id) => {
  console.log("[findShowInfo] type:", type, "id:", id);
  if (type == "movie") {
    return (
      (await findMovieTmdb(type, id)) || (await findMovieCinemeta(type, id))
    );
  } else if (type == "series") {
    return (
      (await findSeriesTmdb(type, id)) || (await findSeriesCinemeta(type, id))
    );
  }
};

const findMovieCinemeta = async (type, id) => {
  console.log("[findMovieCinemeta] type:", type, "id:", id);
  const resp = await needle(
    "get",
    "https://v3-cinemeta.strem.io/meta/" + type + "/" + id + ".json"
  );
  return resp.body && { name: resp.body.meta.name, originalName: null, type };
};

const findSeriesCinemeta = async (type, id) => {
  console.log("[findSeriesCinemeta] type:", type, "id:", id);
  const segments = id.split(":");
  if (segments.length == 3) {
    const [id, series, episode] = segments;
    const resp = await needle(
      "get",
      "https://v3-cinemeta.strem.io/meta/" + type + "/" + id + ".json"
    );
    return (
      resp.body && {
        name: resp.body.meta.name,
        originalName: null,
        type,
        series,
        episode,
      }
    );
  }
};

const tmbdHeaders = {
  accept: "application/json",
  Authorization: `Bearer ${tmdbApiKey}`,
};

const getFirstResult = (response) => {};
const findMovieTmdb = async (type, id) => {
  console.log("[findMovieTmdb] type:", type, "id:", id);
  const resp = await needle(
    "get",
    `https://api.themoviedb.org/3/find/${id}?external_source=imdb_id&language=cs`,
    null,
    { headers: tmbdHeaders }
  );
  if (resp.statusCode == 200) {
    const results = resp.body.movie_results;
    if (results.length >= 1) {
      return {
        name: results[0].title,
        originalName: results[0].original_title,
        type,
      };
    }
  }
};

const findSeriesTmdb = async (type, id) => {
  console.log("[findSeriesTmdb] type:", type, "id:", id);
  const segments = id.split(":");
  if (segments.length == 3) {
    const [id, series, episode] = segments;
    const resp = await needle(
      "get",
      `https://api.themoviedb.org/3/find/${id}?external_source=imdb_id&language=cs`,
      null,
      { headers: tmbdHeaders }
    );
    if (resp.statusCode == 200) {
      const results = resp.body.tv_results;
      if (results.length >= 1) {
        return {
          name: results[0].name,
          originalName: results[0].original_name,
          type,
          series,
          episode,
        };
      }
    }
  }
};

module.exports = { findShowInfo };
