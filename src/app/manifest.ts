import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Б.Ганбат багшийн математикийн сургалт",
    short_name: "Ганбат багш",
    description: "4–12-р ангийн сурагчдад зориулсан олимпиадын математикийн онлайн сургалт.",
    start_url: "/profile",
    display: "standalone",
    background_color: "#fdfdfd",
    theme_color: "#0b3d78",
    lang: "mn",
    icons: [
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
