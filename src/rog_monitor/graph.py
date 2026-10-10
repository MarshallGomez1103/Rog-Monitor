"""Terminal time-series chart: multi-row block rendering with axis labels."""

BLOCKS = " ▁▂▃▄▅▆▇█"
GAP = "·"  # columna sin dato (None): marca en la fila inferior, no un 0 falso


def render(values: list[float | None], width: int, height: int = 4) -> list[str]:
    """Render values as `height` rows of block characters, newest at right.
    None = hueco: se dibuja GAP abajo y no cuenta para la escala."""
    nums = [v for v in values[-width:] if v is not None]
    if not values or not nums:
        return [" " * width] * height

    data = values[-width:]
    pad = width - len(data)
    lo, hi = min(nums), max(nums)
    span = (hi - lo) or 1.0

    rows = []
    levels = height * 8
    scaled = [None if v is None else max(1, round((v - lo) / span * (levels - 1)) + 1)
              for v in data]
    for row in range(height - 1, -1, -1):
        base = row * 8
        line = " " * pad
        for s in scaled:
            if s is None:
                line += GAP if row == 0 else " "
                continue
            fill = min(max(s - base, 0), 8)
            line += BLOCKS[fill]
        rows.append(line)
    return rows


def axis_labels(values: list[float | None], width: int) -> tuple[str, str]:
    """(top_label, bottom_label) = max and min over the visible window."""
    data = [v for v in values[-width:] if v is not None]
    if not data:
        return "", ""
    return f"{max(data):.0f}", f"{min(data):.0f}"
