"""Build a versioned information guide; never replace consent documents."""
from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Image

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "assets/crew-docs/recar-crew-quick-guide-20261014.pdf"
pdfmetrics.registerFont(TTFont("Crew", "/System/Library/Fonts/Supplemental/AppleGothic.ttf"))
INK = colors.HexColor("#182131")
BLUE = colors.HexColor("#145DDD")
MUTED = colors.HexColor("#526174")
styles = {
    "title": ParagraphStyle("title", fontName="Crew", fontSize=29, leading=40, textColor=INK, spaceAfter=20, wordWrap=None),
    "heading": ParagraphStyle("heading", fontName="Crew", fontSize=19, leading=28, textColor=INK, spaceBefore=18, spaceAfter=12, wordWrap=None),
    "body": ParagraphStyle("body", fontName="Crew", fontSize=12, leading=21, textColor=INK, spaceAfter=14, wordWrap=None, alignment=TA_LEFT),
    "small": ParagraphStyle("small", fontName="Crew", fontSize=10, leading=17, textColor=MUTED, spaceAfter=12, wordWrap=None),
    "label": ParagraphStyle("label", fontName="Crew", fontSize=11, leading=18, textColor=BLUE, spaceAfter=12, wordWrap=None),
}


def p(text, style="body"):
    return Paragraph(text, styles[style])


def footer(canvas, doc):
    canvas.setStrokeColor(colors.HexColor("#DCE2E9"))
    canvas.line(42, 42, 553, 42)
    canvas.setFont("Crew", 9)
    canvas.setFillColor(MUTED)
    canvas.drawString(42, 26, "RE:CAR 크루 | 안내 요약 · 2026.10.14 정리")
    canvas.drawRightString(553, 26, str(doc.page))


story = [
    p("빠르게 리카 알아보기", "label"),
    p("RE:CAR 크루<br/>추천으로 시작하는 차량 부업", "title"),
    p("차량이 필요한 사람에게 내 링크를 전달하세요. 상담부터 심사·계약·차량 인도까지 RE:CAR 운영팀이 이어갑니다."),
    p("01. 신청하고 승인받기", "heading"),
    p("웹 신청 화면에서 이름·연락처·로그인 정보를 입력합니다. 운영팀 확인 후 승인된 크루에게 추천 코드와 전용 링크가 발급됩니다. 신청만으로 승인이나 보상이 보장되는 것은 아닙니다."),
    p("02. 필요한 사람에게 링크 전달", "heading"),
    p("차량이 필요한 직장 동료·가족·친구에게 안내할 수 있습니다. 수수료 관계를 함께 밝히고, 상대방이 직접 공식 링크에서 문의하도록 안내하세요. 자신의 코드로 자신의 계약을 연결하는 자기 추천은 보상 제외 대상입니다."),
    p("03. 진행 상태와 정산 확인", "heading"),
    p("대시보드에서 상담·심사·계약 진행과 정산 내역을 확인합니다. 계약 성사·인도 완료 후 유효 실적을 검토합니다. 추천이나 상담 접수만으로 계약 보상이 확정되지는 않습니다."),
    p("크루 신청: https://recarplan.com/crew/login.html?action=apply<br/>상세 가이드: https://recarplan.com/crew/guide/", "small"),
    PageBreak(),
    p("02 · 보상과 정산", "label"),
    p("금액만큼 중요한,<br/>보상 확정 조건", "title"),
    p("계약 보상 프로모션 · 차량가 구간별 세전 금액", "heading"),
]
table = Table([
    [p("차량가 구간"), p("건별 보상")],
    [p("4,000만원 미만"), p("20만원")],
    [p("4,000만원 이상~8,000만원 미만"), p("35만원")],
    [p("8,000만원 이상"), p("45만원")],
], colWidths=[355, 155])
table.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E4F2ED")),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("LEFTPADDING", (0, 0), (-1, -1), 12),
    ("RIGHTPADDING", (0, 0), (-1, -1), 12),
    ("TOPPADDING", (0, 0), (-1, -1), 10),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ("LINEBELOW", (0, 0), (-1, -1), .6, colors.HexColor("#D5E0DF")),
]))
story += [table, Spacer(1, 20),
    p("계약 성사와 차량 인도 완료 후 운영팀이 유효 실적을 확인해 확정합니다. 모든 계약에 최대 금액이 적용되지 않습니다. 적용 차량가와 보상은 실제 계약 자료·정산 내역으로 확인합니다."),
    p("확정 → 출금 신청 → 지급", "heading"),
    p("최소 출금 신청 금액은 30만원입니다. 월말까지 승인된 출금 신청은 약관 기준 다음 달 25일에 지급하며, 휴일이면 다음 영업일로 조정됩니다. 계정 유형과 적용 법령에 따라 세금이 공제될 수 있으므로 입금액은 정산 명세로 확인하세요."),
    p("취소·중복·자기 추천 등은 제외", "heading"),
    p("정상 거래 요건을 충족하지 못한 실적은 제외되며, 이미 지급된 보상도 취소·해지 등의 사유로 환수될 수 있습니다. 클릭·앱 다운로드·가입만으로 보상이 발생하지 않습니다. 약관의 조건요청 보상 5,000원은 연령 21~75세, 휴대폰 인증과 내부 유효성 확인 등 별도 요건을 충족한 경우에 한합니다."),
    p("위 금액은 프로모션 기준입니다. 종료·변경은 운영 공지와 적용 약관을 확인합니다. 고정 급여 또는 수익 보장이 아닙니다.", "small"),
    PageBreak(),
    p("03 · 누적 성과 혜택", "label"),
    p("누적 유효 계약 100대,<br/>차량 1년 이용 지원", "title"),
    p("BMW·Tesla·벤츠·제네시스 중 선택 가능한 혜택입니다. 아래 사진과 차종은 예시이며 실제 제공 모델과 사양을 보장하는 목록이 아닙니다."),
]
vehicles = [
    ("bmw-520i-g60.png", "BMW 5시리즈 · 520i (G60)"),
    ("tesla-model-y-juniper.png", "Tesla Model Y · Juniper Premium RWD"),
    ("mercedes-e200-avantgarde.png", "벤츠 E-Class · E200 Avantgarde"),
    ("genesis-g80-25t.png", "제네시스 G80 · 2.5 터보 2WD"),
]
cells = []
for filename, label in vehicles:
    image_path = ROOT / "assets/crew-njob/reward-vehicles" / filename
    width, height = ImageReader(str(image_path)).getSize()
    cells.append([Image(str(image_path), width=225, height=225 * height / width), p(label, "small")])
photos = Table([[cells[0], cells[1]], [cells[2], cells[3]]], colWidths=[255, 255])
photos.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("TOPPADDING", (0, 0), (-1, -1), 12)]))
story += [photos, Spacer(1, 16),
    p("차량을 소유하게 되는 혜택이 아닙니다", "heading"),
    p("1년 이용 지원이며 소유권을 이전하지 않습니다. 취소·보상 제외 건은 누적 실적에서 제외됩니다. 실제 제공 모델·색상·사양, 보험·주행거리·이용 시작일과 비용 부담 등 세부 조건은 달성 확인 후 운영팀 안내를 확인하세요."),
    PageBreak(),
    p("04 · 운영과 안전한 추천", "label"),
    p("누가 운영하고,<br/>무엇을 확인해야 하나요?", "title"),
    p("크루 가입 계약·보상 지급 운영자", "heading"),
    p("조홍철 · RE:CAR 크루 운영자<br/>문의: friends@recarplan.com / 010-6573-1038"),
    p("추천할 때 수수료 관계를 표시하세요", "heading"),
    p("이 게시물은 RE:CAR 크루 활동의 일환입니다. 이 추천 링크를 통한 계약·차량 인도 완료 등 유효 실적에 대해 RE:CAR로부터 수수료를 지급받습니다. 고객에게 크루 추천 수수료를 별도로 청구하지 않습니다."),
    p("추천 글이나 링크 안내 시작 부분에서 경제적 이해관계를 쉽게 알아볼 수 있게 표시하세요. 허위 후기, 승인·수익 보장이나 근거 없는 최저가 표현은 사용하지 않습니다. 조회 시점의 비교 견적을 안내하며 미래의 최저가를 보장하지 않습니다."),
    p("개인정보와 계약 원문", "heading"),
    p("고객 연락처를 동의 없이 대신 등록하지 마세요. 신청 정보는 심사·계정·활동·정산 업무에 사용합니다. 수집 항목, 보유 기간과 권리 행사는 신청 화면의 개인정보 동의 원문을 확인하고 정정·삭제·탈퇴 문의는 운영팀에 남겨주세요."),
    p("이 문서는 안내 요약으로 기존 가입 약관 v1.3 원문이나 동의 기록을 변경하지 않습니다. 가입·정산에는 신청 시 동의한 약관이 적용됩니다. 계약 조건과 최종 승인은 제휴 금융사·렌터카사의 심사 및 계약 기준에 따릅니다.", "small"),
    p("운영·보상 안내: https://recarplan.com/crew/policy.html<br/>가입 약관: https://recarplan.com/crew/friends/recar-friends-terms-v1.3.pdf", "small"),
]
SimpleDocTemplate(str(OUTPUT), pagesize=(595, 842), rightMargin=42, leftMargin=42, topMargin=44, bottomMargin=60, title="RE:CAR 크루 - 빠르게 리카 알아보기", author="RE:CAR").build(story, onFirstPage=footer, onLaterPages=footer)
print(OUTPUT)
