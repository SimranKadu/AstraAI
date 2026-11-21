import { describe, expect, it } from "vitest";
import { answerLocally, search, knowledgeStats } from "@/lib/local-knowledge.server";
import { PERSONAS } from "@/data/personas";

const IN = [
  "What products are available through MOSDAC?",
  "Compare INSAT-3D and INSAT-3DR",
  "How can I download satellite data?",
  "What is the objective of the NISAR mission?",
  "Tell me about Chandrayaan-3",
  "What payloads does Aditya-L1 carry?",
  "What is the SAPHIR rain retrieval accuracy?",
  "Explain the chlorophyll algorithm for Oceansat",
  "What is XPoSat?",
  "Which launch vehicle carried SCATSAT-1?",
];
const OUT = [
  "What is the capital of Australia?",
  "Who is the Prime Minister of India?",
  "Who is the president of France?",
  "How do I bake a chocolate cake?",
  "What is the price of bitcoin today?",
  "Explain quantum chromodynamics gluon confinement",
  "Who won the cricket world cup in 2011?",
];

describe("local knowledge", () => {
  it("answers archive questions locally", () => {
    for (const q of IN) {
      const a = answerLocally(q);
      expect(a.confident, q).toBe(true);
      expect(a.text.length, q).toBeGreaterThan(60);
    }
  });

  it("hands unknown questions to the API backup", () => {
    for (const q of OUT) expect(answerLocally(q).confident, q).toBe(false);
  });

  it("answers every persona starter question from the archive", () => {
    const expected: Record<string, RegExp> = {
      vikram: /Thumba|INCOSPAR|limited/i,
      kalam: /SLV-3/,
      kalpana: /trans-lunar|Vikram|descent/i,
      rakesh: /three astronauts|Gaganyaan/i,
      satish: /failure/i,
      sunita: /exercise|sunrises/i,
    };
    for (const p of PERSONAS) {
      const a = answerLocally(p.starter, { personaName: p.name });
      expect(a.confident, p.starter).toBe(true);
      expect(a.text, p.starter).toMatch(expected[p.id]!);
      expect(a.text, p.starter).not.toContain("not fully certain");
    }
  });

  it("answers career questions from the trained career guide", () => {
    const exams = answerLocally("What exams are needed for Technical Assistant?");
    expect(exams.confident).toBe(true);
    expect(exams.text).toContain("centre-specific");
    const books = answerLocally("Books for Scientist Engineer Mechanical Aerospace");
    expect(books.text).toContain("Rocket Propulsion Elements");
    const gate = answerLocally("Is GATE compulsory for ISRO?");
    expect(gate.confident).toBe(true);
    expect(gate.text).toContain("Do not assume");
    expect(gate.text.split("Do not assume").length - 1).toBe(1); // the same passage is not repeated per role
    expect(gate.text).not.toContain("B.E");
    const roadmap = answerLocally("Roadmap for Remote Sensing Earth Observation Scientist");
    expect(roadmap.text).toContain("Month 1");
    const degree = answerLocally("Which degree should I choose for satellite software at ISRO?");
    expect(degree.text).toContain("B.E./B.Tech");
  });

  it("is confident about naturally worded career questions the notes answer", () => {
    for (const q of ["Can a diploma holder join ISRO?", "Can I join ISRO after 12th?", "Which exam do I take to become a scientist at ISRO?", "Is there a single exam for ISRO jobs?"])
      expect(answerLocally(q).confident, q).toBe(true);
    expect(answerLocally("Can a diploma holder join ISRO?").text).toContain("Technical Assistant");
  });

  it("stays unsure when no document covers the question, so the AI backup can answer", () => {
    expect(answerLocally("What salary does an ISRO scientist get?").confident).toBe(false);
  });

  it("explains a score with diagnose()", async () => {
    const { diagnose } = await import("@/lib/local-knowledge.server");
    const d = diagnose("What salary does an ISRO scientist get?");
    expect(d.confidence).toBeLessThan(d.threshold);
    expect(d.terms.find((t) => t.term === "salary")?.inTop).toBe(false); // the missing word to add to a note
    expect(d.top.length).toBeGreaterThan(0);
  });

  it("answers from the Comprehensive Reference and the Mission Encyclopedia", () => {
    const gsat = answerLocally("Which launcher carried GSAT-9?");
    expect(gsat.confident).toBe(true);
    expect(gsat.text).toContain("Launch event 61: GSLV-F09");
    expect(gsat.text).toContain("Launcher: GSLV Mk II");
    expect(gsat.text).toContain("5 May 2017");
    expect(gsat.text.indexOf("Launch event 61")).toBeLessThan(gsat.text.indexOf("Launch event 17")); // the exact row comes first
    expect(answerLocally("Compare PSLV and GSLV").text).toContain("Launch vehicle quick comparison");
    expect(answerLocally("What does NavIC do?").confident).toBe(true);
    expect(answerLocally("Why is going to Mars difficult?").text).toContain("13.2 Why Mars is difficult");
    const rover = answerLocally("What did the Chandrayaan-3 rover measure?");
    expect(rover.sources.join(" ")).toMatch(/Encyclopedia|Comprehensive Reference/);
  });

  it("handles greetings without the API", () => {
    expect(answerLocally("hello").confident).toBe(true);
  });

  it("indexes the trained documents", () => {
    expect(knowledgeStats.documents).toBeGreaterThan(50);
    expect(search("NISAR").chunks.length).toBeGreaterThan(0);
  });

  it("gives detailed, sectioned answers for named missions", () => {
    const aditya = answerLocally("What payloads does Aditya-L1 carry?").text;
    expect(aditya.length).toBeGreaterThan(2000);
    expect(aditya).toContain("VELC");
    expect(aditya).toContain("SUIT");
    expect(aditya).toContain("1.5 million km");
    const compare = answerLocally("Compare INSAT-3D and INSAT-3DR").text;
    expect(compare).toContain("| Launch vehicle |");
    expect(compare).toContain("### INSAT-3DR");
    expect(answerLocally("Tell me about NISAR").text.length).toBeGreaterThan(2500);
  });

  it("sample answers", () => {
    for (const q of ["Compare INSAT-3D and INSAT-3DR", "How can I download satellite data?", "Tell me about NISAR", "How does the SAPHIR rain retrieval algorithm work?"]) {
      console.log("\n### " + q + "\n" + answerLocally(q).text);
    }
  });
});
