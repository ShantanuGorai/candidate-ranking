import json

def rank_candidates(results):
    valid_results = [
        result
        for result in results
        if "score" in result
    ]

    ranked_results = sorted(
        valid_results,
        key=lambda x: x["score"],
        reverse=True
    )

    for rank, candidate in enumerate(
        ranked_results,
        start=1
    ):
        candidate["rank"] = rank

    return ranked_results

def save_ranked_candidates(
    ranked_results,
    file_name="ranked_candidates.json"
):
    with open(
        file_name,
        "w",
        encoding="utf-8"
    ) as file:
        json.dump(
            ranked_results,
            file,
            indent=4,
            ensure_ascii=False
        )

if __name__ == "__main__":
    with open(
        "ranking_results.json",
        "r",
        encoding="utf-8"
    ) as file:
        results = json.load(file)

    ranked_results = rank_candidates(
        results
    )

    save_ranked_candidates(
        ranked_results
    )

    print(
        "\nCandidates ranked successfully!"
    )

    print(
        json.dumps(
            ranked_results,
            indent=4,
            ensure_ascii=False
        )
    )