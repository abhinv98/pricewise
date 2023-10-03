"use server";

import axios from "axios";
import Sentiment from "sentiment";
import cheerio from "cheerio";
import { extractCurrency, extractDescription, extractPrice } from "../utils";

export async function scrapeAmazonProduct(url: string) {
  if (!url) return;
  const username = String(process.env.BRIGHT_DATA_USERNAME);
  const password = String(process.env.BRIGHT_DATA_PASSWORD);
  const port = 22225;
  const session_id = (1000000 * Math.random()) | 0;
  const options = {
    auth: {
      username: `${username}-session-${session_id}`,
      password: password,
    },
    host: "brd.superproxy.io",
    port: port,
    rejectUnauthorized: false,
  };
  try {
    const response = await axios.get(url, options);
    const $ = cheerio.load(response.data);

    const title = $("#productTitle").text().trim();
    const description = extractDescription($);
    const currentPrice = extractPrice(
      $(".priceToPay span.a-price-whole"),
      $("a.size.base.a-color-price"),
      $(".a-button-selected .a-color-base"),
      $(".a-price.a-text-price")
    );

    const originalPrice = extractPrice(
      $("#priceblock_ourprice"),
      $("a-price.a-text-price span.a-offscreen"),
      $("#listprice"),
      $("#priceblock_dealprice"),
      $(".a-size-base.a-color-price")
    );

    const outOfStock =
      $("#availability span").text().trim().toLowerCase() ===
      "currently unavailable";

    const images =
      $("#imgBlkFront").attr("data-a-dynamic-image") ||
      $("#landingImage").attr("data-a-dynamic-image") ||
      "{}";

    const imageUrls = Object.keys(JSON.parse(images));

    const currency = extractCurrency($(".a-price-symbol"));

    const discountRate = $(".savingsPercentage").text().replace(/[-%]/g, "");

    const reviewCount = $("#acrCustomerReviewText")
      .text()
      .split(" ")[0]
      .replace(",", "");

    const starsRaw = $("#acrPopover .a-icon-alt").text();
    const stars = parseFloat(starsRaw.split(" ")[0]);
    const sentiment = new Sentiment();

    const reviewElements = $(".review-text-content span").toArray();

    const sentiments = reviewElements.map((element) => {
      const reviewText = $(element).text();
      const sentimentScore = sentiment.analyze(reviewText).comparative;
      return sentimentScore;
    });

    const averageSentimentScore =
      sentiments.reduce((a, b) => a + b, 0) / sentiments.length || 0;

    let sentimentClassification;
    if (averageSentimentScore > 0) {
      sentimentClassification = "Positive";
    } else if (averageSentimentScore < 0) {
      sentimentClassification = "Negative";
    } else {
      sentimentClassification = "Neutral";
    }

    const data = {
      url,
      currency: currency,
      image: imageUrls[0],
      title,
      description,
      currentPrice: Number(currentPrice) || Number(originalPrice),
      originalPrice: Number(originalPrice) || Number(currentPrice),
      priceHistory: [],
      discountRate: Number(discountRate),
      category: "category",
      reviewsCount: Number(reviewCount),
      reviewSentiment: averageSentimentScore,
      stars: stars,
      isOutOfStock: outOfStock,
      lowestPrice: Number(currentPrice) || Number(originalPrice),
      highestPrice: Number(originalPrice) || Number(currentPrice),
      average: Number(currentPrice) || Number(originalPrice),
    };

    console.log(data);
  } catch (error: any) {
    throw new Error(`Failed to scrape product: ${error.message}`);
  }
}
