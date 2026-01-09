import React from "react";

const overlayStyle: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.4)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1200,
};

const modalStyle: React.CSSProperties = {
    background: "#fff",
    borderRadius: 8,
    padding: 24,
    width: 400,
    maxWidth: "90vw",
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
    textAlign: "center",
};

interface CreditModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function CreditModal({ isOpen, onClose }: CreditModalProps) {
    if (!isOpen) return null;

    return (
        <div style={overlayStyle} onClick={onClose}>
            <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
                <h2 style={{ margin: "0 0 16px", color: "#333", fontSize: "1.5rem" }}>
                    AvaClo(あばくろ)
                </h2>

                <p style={{ margin: "0 0 8px", fontSize: "1.1rem" }}>
                    Version 0.0.2α
                </p>

                <div style={{ margin: "24px 0", borderTop: "1px solid #eee", borderBottom: "1px solid #eee", padding: "16px 0" }}>
                    <p style={{ margin: "0 0 8px", fontWeight: "bold", color: "#666" }}>
                        Circle: Last Memories
                    </p>
                    <p style={{ margin: "0 0 8px", fontWeight: "bold", color: "#666" }}>
                        Developer: Sonoty
                    </p>

                    <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 12 }}>
                        <a
                            href="https://x.com/SonotyHearts"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: "#1da1f2", textDecoration: "none", fontWeight: "bold" }}
                        >
                            X (Twitter)
                        </a>
                        <span style={{ color: "#ddd" }}>|</span>
                        <a
                            href="https://vrchat.com/home/user/usr_668cf573-47de-4418-85fe-95e319e2c413"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: "#e3305c", textDecoration: "none", fontWeight: "bold" }}
                        >
                            VRChat
                        </a>
                    </div>
                </div>

                <div style={{ margin: "16px 0", fontSize: "0.9rem", color: "#666" }}>
                    <p style={{ margin: "0 0 8px" }}>
                        ログイン情報を取り扱っているため、透明性の確保として<br />
                        GitHubにてソースコードを公開しています。
                    </p>
                    <a
                        href="https://github.com/grandtears/AvaClo-VRC-Avatar-Closet-"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "#333", textDecoration: "underline" }}
                    >
                        GitHub Repository
                    </a>
                </div>

                <button
                    className="btn btn-secondary"
                    onClick={onClose}
                    style={{ width: 100 }}
                >
                    閉じる
                </button>
            </div>
        </div>
    );
}
