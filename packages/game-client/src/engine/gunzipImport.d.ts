/** A gzipped file's text, unzipped at build time by `gunzipImports` (`@boleiro/data/gunzipImports`). */
declare module "*?gunzip" {
  const text: string;
  export default text;
}

/** The data pack's text with only its format and clubs, for screens that list clubs. */
declare module "*?gunzip&keys=format,clubs" {
  const text: string;
  export default text;
}

/** The national-football pack's text with only its format and teams, for screens that show national teams' crests. */
declare module "*?gunzip&keys=format,teams" {
  const text: string;
  export default text;
}
