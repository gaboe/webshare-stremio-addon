const needle = require("needle");

// filesizeFn will be passed as an argument to rerankWithGroq

const rerankWithGroq = async (
  candidateResults,
  primaryQuery,
  groqApiKey,
  filesizeFn
) => {
  if (!candidateResults || candidateResults.length === 0) {
    return [];
  }

  // Default to top 10 of candidates if Groq fails or provides no valid selection
  let finalRankedResults = candidateResults.slice(0, 10);

  const promptContent = `Original search query: "${primaryQuery}"

Based on this query, please select the top 10 most relevant files from the following list. Provide your answer as a comma-separated list of numbers corresponding to the items in the list (e.g., "1, 3, 5, 2, 4, 6, 8, 7, 9, 10"). If there are fewer than 10 relevant items, list all relevant ones. If no items seem relevant, return an empty list or a "NO_RELEVANT_ITEMS" message.

Candidate files:
${candidateResults
  .map(
    (r, index) =>
      `${index + 1}. ${r.name} (Size: ${filesizeFn(
        r.size
      )}, Score: ${r.match.toFixed(2)}, Votes: ${r.posVotes})`
  )
  .join("\n")}

Your selection (comma-separated numbers):`;

  const groqRequestData = {
    model: "meta-llama/llama-4-scout-17b-16e-instruct",
    messages: [
      {
        role: "user",
        content: promptContent,
      },
    ],
    temperature: 0.1,
    max_tokens: 150,
  };

  console.log(
    "[reranker][groq] Sending prompt to Groq for query:",
    primaryQuery
  );

  try {
    const groqResponse = await needle(
      "post",
      "https://api.groq.com/openai/v1/chat/completions",
      JSON.stringify(groqRequestData),
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${groqApiKey}`,
        },
        json: true,
        timeout: 15000,
      }
    );

    if (
      groqResponse.body &&
      groqResponse.body.choices &&
      groqResponse.body.choices.length > 0 &&
      groqResponse.body.choices[0].message &&
      groqResponse.body.choices[0].message.content
    ) {
      const groqChoice = groqResponse.body.choices[0].message.content.trim();
      console.log("[reranker][groq] Received choice from Groq:", groqChoice);

      if (
        groqChoice.toUpperCase() === "NO_RELEVANT_ITEMS" ||
        groqChoice === ""
      ) {
        console.log(
          "[reranker][groq] Groq indicated no relevant items or returned empty. Using original top 10."
        );
        // finalRankedResults is already set to candidateResults.slice(0, 10)
      } else {
        const selectedIndices = groqChoice
          .split(",")
          .map((s) => parseInt(s.trim(), 10) - 1)
          .filter(
            (idx) => !isNaN(idx) && idx >= 0 && idx < candidateResults.length
          );

        if (selectedIndices.length > 0) {
          const groqSelectedItems = selectedIndices.map(
            (idx) => candidateResults[idx]
          );
          let combinedResults = [...groqSelectedItems];
          const addedIdents = new Set(
            groqSelectedItems.map((item) => item.ident)
          );

          if (combinedResults.length < 10) {
            for (const candidate of candidateResults) {
              if (combinedResults.length >= 10) break;
              if (!addedIdents.has(candidate.ident)) {
                combinedResults.push(candidate);
                addedIdents.add(candidate.ident);
              }
            }
          }
          finalRankedResults = combinedResults;
          console.log(
            `[reranker][groq] Successfully processed Groq selection. Total items: ${finalRankedResults.length}`
          );
        } else {
          console.warn(
            "[reranker][groq] Groq returned a non-empty choice but no valid indices could be parsed. Using original top 10."
          );
          // finalRankedResults is already set to candidateResults.slice(0, 10)
        }
      }
    } else {
      console.warn(
        "[reranker][groq] Groq API call failed or returned empty/invalid response structure. Using original top 10. Response body:",
        groqResponse.body
          ? JSON.stringify(groqResponse.body, null, 2)
          : "No body"
      );
      // finalRankedResults is already set to candidateResults.slice(0, 10)
    }
  } catch (error) {
    console.error(
      "[reranker][groq] Error calling Groq API:",
      error.message,
      "Using original top 10."
    );
    // finalRankedResults is already set to candidateResults.slice(0, 10)
  }
  return finalRankedResults.slice(0, 10); // Ensure max 10 results
};

module.exports = { rerankWithGroq };
