const needle = require("needle");
const md5 = require("nano-md5");
const sha1 = require("sha1");
const formencode = require("form-urlencoded");
const { filesize } = require("filesize");

const headers = {
  content_type: "application/x-www-form-urlencoded; charset=UTF-8",
  accept: "text/xml; charset=UTF-8",
};

const getQueries = (info) => {
  console.log("[webshare][getQueries] info:", info);
  const names = Array.from(
    new Set([info.name, info.originalName].filter((n) => n))
  );
  if (info.type == "series") {
    return names.flatMap((name) => {
      const series = info.series.padStart(2, "0");
      const episode = info.episode.padStart(2, "0");
      return [`${name} S${series}E${episode}`, `${name} ${series}x${episode}`];
    });
  } else {
    return names;
  }
};

const search = async (query, token) => {
  console.log("[webshare][search] query:", query, "token:", token);
  const data = formencode({
    what: query,
    category: "video",
    limit: 100,
    wst: token,
  });
  const resp = await needle("post", "https://webshare.cz/api/search/", data, {
    headers,
  });
  const files = resp.body.children.filter((el) => el.name == "file");
  const queryWords = query
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .split(" ");

  return (
    files
      .map((el) => {
        const ident = el.children.find((el) => el.name == "ident").value;
        const size = el.children.find((el) => el.name == "size").value;
        const posVotes = el.children.find(
          (el) => el.name == "positive_votes"
        ).value;
        const negVotes = el.children.find(
          (el) => el.name == "negative_votes"
        ).value;
        const name = el.children.find((el) => el.name == "name").value;
        const protected = el.children.find((el) => el.name == "password");
        return {
          ident,
          name,
          size,
          posVotes,
          negVotes,
          protected: protected && protected.value == "1",
        };
      })
      // exclude protected files
      .filter((item) => !item.protected)
      // compute match factor, that will be used to sort results later
      .map((item) => {
        const simpleName = item.name
          .toLowerCase()
          .normalize("NFD")
          .replace(/\p{Diacritic}/gu, "");
        const matching = queryWords.filter((word) => simpleName.includes(word));
        return { ...item, match: matching.length / queryWords.length };
      })
      // only include files that actually match the query - contain at least one keyword
      .filter((item) => item.match > 0)
  );
};
const webshare = {
  login: async (user, password) => {
    console.log(`[webshare][login] Logging in user ${user}`);
    // get salt
    const saltResp = await needle(
      "https://webshare.cz/api/salt/",
      `username_or_email=${user}`,
      headers
    );
    const salt = saltResp.body.children.find((el) => el.name == "salt").value;

    // login
    const passEncoded = sha1(md5.crypt(password, salt));
    const data = formencode({
      username_or_email: user,
      password: passEncoded,
      keep_logged_in: 0,
    });
    const resp = await needle(
      "post",
      "https://webshare.cz/api/login/",
      data,
      headers
    );
    if (
      resp.statusCode != 200 ||
      resp.body.children.find((el) => el.name == "status").value != "OK"
    ) {
      throw Error("Cannot log in to Webshare.cz, invalid login credentials");
    }
    return resp.body.children.find((el) => el.name == "token").value;
  },

  // improve movie query by adding year with movies
  // search localized names too
  // we could also combine multiple different queries to get better results
  search: async (showInfo, token) => {
    console.log(`[webshare][search] showInfo: ${showInfo}, token: ${token}`);
    const queries = getQueries(showInfo);
    let results = await Promise.all(
      queries.map((query) => search(query, token))
    );
    results = results.flatMap((items) => items);

    results.sort((a, b) => {
      if (a.match != b.match) {
        return b.match - a.match;
      } else if (a.posVotes != b.posVotes) {
        return b.posVotes - a.posVotes;
      } else {
        return b.size - a.size;
      }
    });

    return results
      .map((item) => ({
        ident: item.ident,
        description: item.name,
        name: `💾 ${filesize(item.size)} 👍 ${item.posVotes} 👎 ${
          item.negVotes
        }`,
      }))
      .slice(0, 20);
  },

  addUrlToStreams: (streams, token) => {
    return Promise.all(
      streams.map(async (stream) => {
        const { ident, ...restStream } = stream;
        const data = formencode({
          ident,
          download_type: "video_stream",
          force_https: 1,
          wst: token,
        });
        const resp = await needle(
          "post",
          "https://webshare.cz/api/file_link/",
          data,
          { headers }
        );
        const status = resp.body.children.find(
          (el) => el.name == "status"
        ).value;
        if (status == "OK") {
          const url = resp.body.children.find((el) => el.name == "link").value;
          return { ...restStream, url };
        } else {
          return restStream;
        }
      })
    );
  },
};
module.exports = webshare;
