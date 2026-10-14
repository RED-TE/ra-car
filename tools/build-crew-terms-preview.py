"""Prepare the approved v1.4 addendum without changing v1.3 or activating it."""
import argparse
import hashlib
import io
import json
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "crew/friends/recar-friends-terms-v1.3.pdf"
OUTPUT = ROOT / "crew/friends/recar-friends-terms-v1.4-preview.pdf"
MANIFEST = ROOT / "docs/verification/crew-terms-v14-preview.json"
SOURCE_SHA256 = "48c3f29502436d7c844cea8f22a388d2c1aae3831b716dfd9c589b488f361d96"
SECTIONS = {"terms": 1, "privacy": 9, "settlement": 7, "disclosure": 16, "advertising": 16}


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def verify(source_data, output_data):
    if sha256(source_data) != SOURCE_SHA256:
        raise ValueError("The original v1.3 file changed; stop rather than replace it.")
    source = PdfReader(io.BytesIO(source_data))
    output = PdfReader(io.BytesIO(output_data))
    if len(source.pages) != 16 or len(output.pages) != 17:
        raise ValueError("Expected one approved addendum and all 16 original pages.")
    for index, (before, after) in enumerate(zip(source.pages, list(output.pages)[1:]), start=1):
        if before.get_contents().get_data() != after.get_contents().get_data():
            raise ValueError("An original page content stream changed.")
        if before.extract_text() != after.extract_text():
            raise ValueError(f"Original page {index} text changed.")
        if any(abs(float(left) - float(right)) > 0.000001 for left, right in zip(before.mediabox, after.mediabox)):
            raise ValueError(f"Original page {index} size changed.")
    first = output.pages[0].extract_text()
    for required in ["미게시 준비본", "조홍철", "BMW", "Tesla", "벤츠", "제네시스", "100대", "1년", "신규 가입", "기존 가입자"]:
        if required not in first:
            raise ValueError(f"Approved addendum is missing: {required}")
    for section, page in SECTIONS.items():
        phrase = {"terms": "v1.4", "privacy": "제 12 조", "settlement": "제 7 조", "disclosure": "광고", "advertising": "광고"}[section]
        if phrase not in output.pages[page - 1].extract_text():
            raise ValueError(f"Incorrect consent section page: {section}")
    return {
        "state": "UNPUBLISHED_PREVIEW",
        "version": "v1.4",
        "publication_effective_at": None,
        "active_document_created": False,
        "new_applications_only": True,
        "approved_changes": ["operator_jo_hong_cheol", "100_valid_contracts_four_brand_one_year_use", "actual_publication_new_applications_only"],
        "preview_path": str(OUTPUT.relative_to(ROOT)),
        "preview_sha256": sha256(output_data),
        "preview_pages": 17,
        "source_path": str(SOURCE.relative_to(ROOT)),
        "source_sha256": SOURCE_SHA256,
        "original_pages_preserved": 16,
        "original_page_content_streams_and_text_unchanged": True,
        "sections": SECTIONS,
    }


def build(font):
    if OUTPUT.exists() or MANIFEST.exists():
        raise FileExistsError("Prepared artifacts already exist; use --check. Never overwrite consent documents.")
    source_data = SOURCE.read_bytes()
    if sha256(source_data) != SOURCE_SHA256:
        raise ValueError("The source v1.3 checksum does not match.")
    pdfmetrics.registerFont(TTFont("CrewTerms", str(font)))
    ink, muted = colors.HexColor("#182131"), colors.HexColor("#526174")
    styles = {
        "label": ParagraphStyle("label", fontName="CrewTerms", fontSize=10, leading=17, textColor=muted, spaceAfter=12),
        "title": ParagraphStyle("title", fontName="CrewTerms", fontSize=25, leading=34, textColor=ink, spaceAfter=14),
        "status": ParagraphStyle("status", fontName="CrewTerms", fontSize=12, leading=20, textColor=colors.HexColor("#9B3C21"), spaceAfter=12),
        "heading": ParagraphStyle("heading", fontName="CrewTerms", fontSize=13, leading=21, textColor=ink, spaceBefore=18, spaceAfter=8),
        "body": ParagraphStyle("body", fontName="CrewTerms", fontSize=11, leading=19, textColor=ink, spaceAfter=8),
        "small": ParagraphStyle("small", fontName="CrewTerms", fontSize=10, leading=17, textColor=muted, spaceAfter=8),
    }

    def p(text, style="body"):
        return Paragraph(text, styles[style])

    story = [
        p("RE:CAR 크루 | 이용약관 및 활동 동의서", "label"),
        p("v1.4 변경사항", "title"),
        p("미게시 준비본 - 현재 가입에 적용되지 않습니다", "status"),
        p("승인된 변경사항만 정리한 준비본입니다. 실제 운영 게시일과 시행 시각은 아직 확정되지 않았습니다."),
        p("01. 크루 운영자", "heading"),
        p("크루 가입 계약과 보상 지급의 운영자는 조홍철(RE:CAR 크루 운영자)입니다."),
        p("02. 누적 계약 차량 혜택", "heading"),
        p("누적 유효 계약 100대 달성 시 BMW·Tesla·벤츠·제네시스 중 선택 가능한 차량 1년 이용 혜택을 제공합니다. 차량 소유권 이전이 아닌 1년 이용 혜택입니다."),
        p("유효 계약과 보상 제외 기준은 첨부한 v1.3 원문을 그대로 따릅니다."),
        p("03. 적용 대상과 시행일", "heading"),
        p("실제 운영에 게시되는 날부터 신규 가입 신청에만 v1.4를 적용합니다. 기존 가입자의 v1.3 동의 문서와 동의 기록은 그대로 보존하며, v1.4로 자동 변경하지 않습니다."),
        p("정식 게시 문서에는 실제 운영 게시일과 시행 시각을 기재합니다. 이 준비본에는 임의의 시행일을 넣지 않았습니다.", "small"),
        Spacer(1, 12),
        p("변경 범위와 원문 보존", "heading"),
        p("이번 v1.4의 운영자·차량 혜택·적용 대상 및 시행일은 위 01~03에 따릅니다. 이 세 항목 외 개인정보·정산·향후 약관 변경·관할 등 v1.3의 나머지 조항은 변경하지 않습니다."),
        p("다음 16쪽은 v1.3 원문을 수정 없이 첨부했습니다. 원문의 v1.3 표기와 기존 쪽 번호도 보존했습니다. 이 준비본 전체는 17쪽입니다.", "small"),
    ]

    def footer(canvas, doc):
        canvas.setStrokeColor(colors.HexColor("#DCE2E9"))
        canvas.line(44, 47, 551, 47)
        canvas.setFont("CrewTerms", 9)
        canvas.setFillColor(muted)
        canvas.drawString(44, 29, "RE:CAR 크루 | v1.4 미게시 준비본")
        canvas.drawRightString(551, 29, "변경표 1 / 1 + v1.3 원문 16쪽")

    addendum = io.BytesIO()
    SimpleDocTemplate(addendum, pagesize=(595, 842), leftMargin=44, rightMargin=44, topMargin=44, bottomMargin=65, invariant=1).build(story, onFirstPage=footer, onLaterPages=footer)
    addendum_reader = PdfReader(addendum)
    original_reader = PdfReader(io.BytesIO(source_data))
    if len(addendum_reader.pages) != 1:
        raise ValueError("The approved change sheet must fit on one readable page.")
    writer = PdfWriter()
    # Keep both readers alive: pypdf's object translation is keyed by reader identity.
    writer.append(addendum_reader, import_outline=False)
    writer.append(original_reader, import_outline=False)
    writer.add_metadata({"/Title": "RE:CAR 크루 이용약관 v1.4 - 미게시 준비본", "/Author": "RE:CAR 크루", "/Subject": "Approved changes only; original v1.3 clauses preserved; not active"})
    result = io.BytesIO()
    writer.write(result)
    manifest = verify(source_data, result.getvalue())
    with OUTPUT.open("xb") as output:
        output.write(result.getvalue())
    with MANIFEST.open("x", encoding="utf-8") as output:
        json.dump(manifest, output, ensure_ascii=False, indent=2)
        output.write("\n")
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Verify existing artifacts without writing files.")
    parser.add_argument("--font", type=Path, default=Path("/System/Library/Fonts/Supplemental/AppleGothic.ttf"))
    args = parser.parse_args()
    if args.check:
        manifest = verify(SOURCE.read_bytes(), OUTPUT.read_bytes())
        if manifest != json.loads(MANIFEST.read_text(encoding="utf-8")):
            raise ValueError("Prepared manifest does not match the verified PDF.")
    else:
        manifest = build(args.font)
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
