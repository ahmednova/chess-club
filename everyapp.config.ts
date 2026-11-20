import { defineEveryApp } from "@every-app/sdk";

export default defineEveryApp({
  id: "chess-club",
  name: "Chess Club",
  description:
    "Play chess with your team live or by the day, against bots, or on puzzles, with ratings and a game archive.",
  access: "everyone",
  resources: {
    d1: ["DB"],
  },
});
