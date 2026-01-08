import { useMemo, useState } from "react";

type TagCloudProps = {
    tagCounts: Record<string, number>;
    activeTag: string;
    onSelect: (tag: string) => void;
};

export function TagCloud({ tagCounts, activeTag, onSelect }: TagCloudProps) {
    const tags = useMemo(() => {
        // タグをアルファベット順（あるいは件数順）にソート
        return Object.keys(tagCounts).sort();
    }, [tagCounts]);

    const maxCount = useMemo(() => {
        return Math.max(0, ...Object.values(tagCounts));
    }, [tagCounts]);

    const [isExpanded, setIsExpanded] = useState(true);

    if (tags.length === 0) return null;

    // フォントサイズの計算
    // 最小 0.8rem, 最大 1.2rem くらいに収める
    function getFontSize(count: number) {
        if (maxCount === 0) return "0.85rem";
        const minSize = 0.85;
        const maxSize = 1.3;
        const ratio = count / maxCount;
        const size = minSize + (maxSize - minSize) * ratio;
        return `${size.toFixed(2)}rem`;
    }

    return (
        <div style={{ marginBottom: 20 }}>
            <div
                className="sidebar-title"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <span>
                    タグ <span style={{ fontSize: 12 }}>{isExpanded ? "▼" : "▶"}</span>
                </span>
            </div>

            {isExpanded && (
                <div style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "6px 12px",
                    alignItems: "baseline"
                }}>
                    {tags.map(tag => {
                        const isActive = tag === activeTag;
                        const count = tagCounts[tag];
                        return (
                            <button
                                key={tag}
                                onClick={() => onSelect(isActive ? "" : tag)}
                                style={{
                                    border: "none",
                                    background: isActive ? "#2563eb" : "transparent",
                                    color: isActive ? "#fff" : "#475569",
                                    borderRadius: "4px",
                                    padding: "2px 6px",
                                    cursor: "pointer",
                                    fontSize: getFontSize(count),
                                    fontWeight: isActive ? "bold" : "normal",
                                    transition: "all 0.2s",
                                    lineHeight: 1.2
                                }}
                            >
                                {tag}
                                <span style={{ fontSize: "0.7em", opacity: 0.7, marginLeft: 2 }}>
                                    ({count})
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
