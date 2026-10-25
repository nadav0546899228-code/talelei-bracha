import { useState } from "react";
import { GalleryAlbumView } from "../components/Content";
import { PageHero, Placeholder } from "../components/ui";
import { galleryAlbums } from "../data/content";

export default function Gallery() {
  const categories = ["הכול", ...Array.from(new Set(galleryAlbums.map((a) => a.category)))];
  const [cat, setCat] = useState("הכול");
  const albums = galleryAlbums.filter((a) => cat === "הכול" || a.category === cat);

  return (
    <>
      <PageHero title="גלריה" lead="רגעים מהפעילות - לפי אירועים ותחומי פעילות." />
      <section className="section">
        <div className="container">
          <div className="filters" role="group" aria-label="סינון לפי תחום">
            {categories.map((c) => (
              <button key={c} type="button" className="filter-btn" aria-pressed={cat === c} onClick={() => setCat(c)}>
                {c}
              </button>
            ))}
          </div>
          {albums.map((a) => (
            <GalleryAlbumView key={a.id} album={a} />
          ))}
          <Placeholder title="רק תמונות אמיתיות ומאושרות לפרסום" todo="data.gallery">
            לכל תמונה טקסט חלופי, ותמונות מכווצות ל-WebP. אין להשתמש בתמונות AI כאילו הן תיעוד אמיתי.
          </Placeholder>
        </div>
      </section>
    </>
  );
}
