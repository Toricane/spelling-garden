"""Extract the official PDF without flattening columns or losing stress/italics.

Usage: python tools/extract_words.py path/to/source.pdf
Requires pdfplumber. The copyrighted source PDF is not redistributed.
"""
import hashlib
import json
from pathlib import Path
import re
import sys
import pdfplumber

ROOT = Path(__file__).resolve().parents[1]


def clean(text):
    return re.sub(r"\s+", " ", text).strip()


def text_from(chars):
    return clean(pdfplumber.utils.extract_text(chars, x_tolerance=1.5, y_tolerance=3))


def lines_from(chars):
    lines = []
    for c in sorted(chars, key=lambda c: (round(c["top"], 1), c["x0"])):
        if not lines or abs(lines[-1][0]["top"] - c["top"]) > 3:
            lines.append([])
        lines[-1].append(c)
    return lines


def extract(source):
    words = []
    with pdfplumber.open(source) as pdf:
        for page_index in range(20, 59):
            p = pdf.pages[page_index]
            numbers = [w for w in p.extract_words() if w["x0"] < 95 and re.fullmatch(r"\d+\.", w["text"])]
            for i, number in enumerate(numbers):
                start = number["top"] - 1
                end = numbers[i + 1]["top"] - 1 if i + 1 < len(numbers) else 738
                chars = [c for c in p.chars if start <= c["top"] < end and "Calibri" in c["fontname"]]
                word_chars = [c for c in chars if 97 < c["x0"] < 186]
                raw_word = "\n".join(text_from(line) for line in lines_from(word_chars)).strip()
                homophone_match = re.search(r"\[H:\s*(.*?)\]", raw_word, re.S)
                homophones = [clean(x) for x in homophone_match.group(1).split(",")] if homophone_match else []
                spellings = [clean(x) for x in re.sub(r"\[H:.*?\]", "", raw_word, flags=re.S).splitlines() if re.search(r"[^\W\d_]", x)]
                pronunciation_chars = [c for c in chars if 187 < c["x0"] < 315]
                pronunciations = []
                for line in lines_from(pronunciation_chars):
                    if not text_from(line):
                        continue
                    segments = []
                    for c in line:
                        stress = "Bold" in c["fontname"]
                        if not segments or segments[-1]["stress"] != stress:
                            segments.append({"text": "", "stress": stress})
                        segments[-1]["text"] += c["text"]
                    pronunciations.append({"text": text_from(line), "segments": segments})
                part = text_from([c for c in chars if 316 < c["x0"] < 373])
                meaning_chars = [c for c in chars if 374 < c["x0"] < 583]
                meaning_lines = lines_from(meaning_chars)
                sentence_lines = [line for line in meaning_lines if sum(len(c["text"].strip()) for c in line if "Italic" in c["fontname"]) > sum(len(c["text"].strip()) for c in line) * .6]
                sentence_start = min(c["top"] for c in sentence_lines[0])
                definition = " ".join(text_from(line) for line in lines_from([c for c in meaning_chars if c["top"] < sentence_start - 1])).strip()
                sentence = " ".join(text_from(line) for line in lines_from([c for c in meaning_chars if c["top"] >= sentence_start - 1])).strip()
                entry = {"id": f"sboc-2027-junior-{int(number['text'][:-1]):03d}",
                         "number": int(number["text"][:-1]), "word": spellings[0],
                         "acceptedSpellings": spellings, "homophones": homophones,
                         "pronunciations": pronunciations, "partOfSpeech": part,
                         "definition": definition, "sentence": sentence,
                         "sourcePage": page_index + 1}
                words.append(entry)
    assert [w["number"] for w in words] == list(range(1, 401)), "Word numbers must be exactly 1–400"
    for w in words:
        assert all(w[k] for k in ("word", "acceptedSpellings", "pronunciations", "partOfSpeech", "definition", "sentence")), w
    return words


if __name__ == "__main__":
    source = Path(sys.argv[1])
    words = extract(source)
    output = ROOT / "dist/data/words.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    data = {"edition": "SBOC 2027 Official Junior Word List", "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
            "sourcePages": [21, 59], "words": words}
    output.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Extracted {len(words)} entries to {output}")
    print("Alternatives:", [(w["number"], w["acceptedSpellings"]) for w in words if len(w["acceptedSpellings"]) > 1])
    print("Parts of speech:", sorted(set(w["partOfSpeech"] for w in words)))
