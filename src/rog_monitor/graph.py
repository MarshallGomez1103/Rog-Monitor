"""Terminal time-series chart: multi-row block rendering with axis labels."""

BLOCKS = " ▁▂▃▄▅▆▇█"


def render(values: list[float], width: int, height: int = 4) -> list[str]:
    """Render values as `height` rows of block characters, newest at right."""
    if not values:
        return [" " * width] * height

    data = values[-width:]
    pad = width - len(data)
    lo, hi = min(data), max(data)
    span = (hi - lo) or 1.0

    rows = []
    levels = height * 8
    scaled = [max(1, round((v - lo) / span * (levels - 1)) + 1) for v in data]
    for row in range(height - 1, -1, -1):
        base = row * 8
        line = " " * pad
        for s in scaled:
            fill = min(max(s - base, 0), 8)
            line += BLOCKS[fill]
        rows.append(line)
    return rows


def axis_labels(values: list[float], width: int) -> tuple[str, str]:
    """(top_label, bottom_label) = max and min over the visible window."""
    if not values:
        return "", ""
    data = values[-width:]
    return f"{max(data):.0f}", f"{min(data):.0f}"
