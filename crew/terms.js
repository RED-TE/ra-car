(function () {
  const legacy = {
    version: "v1.3",
    document_url: "https://recarplan.com/crew/friends/recar-friends-terms-v1.3.pdf",
    document_sha256: "48c3f29502436d7c844cea8f22a388d2c1aae3831b716dfd9c589b488f361d96",
    effective_at: null,
    effective_date: null,
    new_applications_only: true,
    sections: { terms: 1, privacy: 8, settlement: 6, disclosure: 15, advertising: 15 },
  };

  async function load() {
    const response = await window.RecarCrew.request("/api/v1/friends/terms", { cache: "no-store", headers: { Accept: "application/json" } });
    // Compatibility with the previous API is limited to the unchanged v1.3 PDF.
    if (response.status === 404) return { ...legacy, sections: { ...legacy.sections } };
    if (!response.ok) throw new Error("가입 약관을 확인하지 못했습니다. 입력한 정보는 유지됩니다. 잠시 후 다시 시도해 주세요.");
    const terms = await response.json();
    if (!terms || typeof terms !== "object") throw new Error("가입 약관 게시 정보를 확인하지 못했습니다.");
    const version = terms.version;
    const expectedUrl = `https://recarplan.com/crew/friends/recar-friends-terms-${version}.pdf`;
    if (!["v1.3", "v1.4"].includes(version) || terms.document_url !== expectedUrl || !/^[a-f0-9]{64}$/.test(terms.document_sha256) || terms.new_applications_only !== true) {
      throw new Error("가입 약관 게시 정보를 확인하지 못했습니다. 운영팀에 문의해 주세요.");
    }
    for (const section of ["terms", "privacy", "settlement", "disclosure", "advertising"]) {
      if (!Number.isInteger(terms.sections?.[section]) || terms.sections[section] < 1) throw new Error("가입 약관의 상세 내용을 확인하지 못했습니다.");
    }
    if (version === "v1.3") {
      if (terms.document_sha256 !== legacy.document_sha256) throw new Error("기존 약관 원문이 변경되어 신청을 중단했습니다. 운영팀에 문의해 주세요.");
    } else {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(terms.effective_date || "") || !terms.effective_at || !window.crypto?.subtle) throw new Error("새 가입 약관의 시행 정보를 확인하지 못했습니다.");
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      let bytes;
      try {
        const pdfResponse = await fetch(expectedUrl, { cache: "no-store", credentials: "omit", headers: { Accept: "application/pdf" }, signal: controller.signal });
        if (!pdfResponse.ok) throw new Error("새 가입 약관 원문이 아직 준비되지 않았습니다. 입력한 정보는 유지됩니다.");
        bytes = await pdfResponse.arrayBuffer();
      } catch (error) {
        if (controller.signal.aborted) throw new Error("가입 약관 원문 응답이 지연됩니다. 입력한 정보는 유지됩니다. 다시 시도해 주세요.");
        throw new Error(error instanceof Error ? error.message : "가입 약관 원문을 확인하지 못했습니다.");
      } finally { clearTimeout(timeout); }
      if (bytes.byteLength > 5_000_000 || new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") throw new Error("가입 약관 원문을 확인하지 못했습니다.");
      const digest = await window.crypto.subtle.digest("SHA-256", bytes);
      const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
      if (hash !== terms.document_sha256) throw new Error("가입 약관 원문과 게시 정보가 달라 신청을 중단했습니다. 운영팀에 문의해 주세요.");
    }
    return terms;
  }

  function same(left, right) {
    return !!left && left.version === right.version && left.document_sha256 === right.document_sha256 && left.effective_at === right.effective_at;
  }
  window.RecarCrewTerms = { load, same };
})();
