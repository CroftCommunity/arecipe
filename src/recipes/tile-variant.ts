// Layout-aware media variant for a recipe tile (RUN-EMPTY-TILE-CHIP). Pure and
// DOM-free so the rule is testable anywhere.
//
// A tile WITH a picture is always a 'photo' (its markup never changes). A
// pictureless tile is the interesting case: at single-column widths it becomes
// an inline 'chip' (a small glyph square beside the title, no media band —
// reclaiming the vertical space an empty 3:2 band cost on mobile); at
// multi-column widths it keeps a media zone ('band'), where horizontal space is
// the constraint and rows want to stay even.

export type TileMediaVariant = 'photo' | 'chip' | 'band';

export const tileMediaVariant = (input: { hasImage: boolean; columns: number }): TileMediaVariant => {
  if (input.hasImage) return 'photo';
  return input.columns <= 1 ? 'chip' : 'band';
};
