import { describe, expect, it } from "vitest";
import { agreeArticles, clubArticle, stadiumArticle, withArticle } from "./articles.js";

describe("articles", () => {
  it("says the clubs the press calls in the feminine with a, the rest with o", () => {
    for (const id of ["chapecoense-sc", "ponte-preta-sp", "portuguesa-sp", "ferroviaria-sp", "tm-506"]) expect(clubArticle(id), id).toBe("a");
    for (const id of ["flamengo-rj", "palmeiras-sp", "vitoria-ba", "tombense-mg", "tm-5"]) expect(clubArticle(id), id).toBe("o");
  });

  it("says an arena with a and a stadium with o", () => {
    for (const name of ["Arena Condá", "Neo Química Arena", "Itaipava Arena Pernambuco"]) expect(stadiumArticle(name), name).toBe("a");
    for (const name of ["Estádio Jornalista Mário Filho", "MorumBIS", "Nubank Parque"]) expect(stadiumArticle(name), name).toBe("o");
  });

  it("joins the article to the preposition before the name", () => {
    expect(withArticle("Chapecoense", "a", "de")).toBe("da Chapecoense");
    expect(withArticle("Flamengo", "o", "de")).toBe("do Flamengo");
    expect(withArticle("Arena Condá", "a", "em")).toBe("na Arena Condá");
    expect(withArticle("Maracanã", "o", "em")).toBe("no Maracanã");
    expect(withArticle("Ponte Preta", "a", "a")).toBe("à Ponte Preta");
    expect(withArticle("Ponte Preta", "a", "por")).toBe("pela Ponte Preta");
    expect(withArticle("Portuguesa", "a")).toBe("a Portuguesa");
  });

  it("turns the masculine article written before a feminine name to the feminine, and leaves the others", () => {
    const named = [
      { name: "Chapecoense", article: "a" as const },
      { name: "Avaí", article: "o" as const },
    ];
    expect(agreeArticles("O Avaí vence o Chapecoense no Chapecoense. Torcida do Chapecoense vai ao Chapecoense pelo Chapecoense.", named)).toBe(
      "O Avaí vence a Chapecoense na Chapecoense. Torcida da Chapecoense vai à Chapecoense pela Chapecoense.",
    );
    expect(agreeArticles("O Chapecoense joga", named)).toBe("A Chapecoense joga");
    expect(agreeArticles("Novo Chapecoense", named)).toBe("Novo Chapecoense");
  });
});
