import { SEARCH_EXAMPLES } from '@/lib/worldsceneData';

interface SearchResult {
  point: {
    id: string;
    name: string;
    country: string;
  };
  score: number;
}

interface Props {
  onQueryChange: (value: string) => void;
  onRunSearch: (value: string) => void;
  onSelectExample: (value: string) => void;
  onSelectResult: (id: string) => void;
  query: string;
  searchMessage: string;
  searchResults: SearchResult[];
}

export function WorldSceneToolbar({
  onQueryChange,
  onRunSearch,
  onSelectExample,
  onSelectResult,
  query,
  searchMessage,
  searchResults,
}: Props) {
  return (
    <section className="worldscene-section worldscene-section--toolbar">
      <div className="worldscene-toolbar">
        <div className="worldscene-search-card">
          <label htmlFor="worldscene-search" className="worldscene-search-card__label">
            语义搜索
          </label>
          <div className="worldscene-search-row">
            <input
              id="worldscene-search"
              className="worldscene-search-input"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') onRunSearch(query);
              }}
              placeholder="输入一句话描述景点，例如“埃菲尔铁塔”或“北京故宫”"
            />
            <button type="button" className="btn btn--primary" onClick={() => onRunSearch(query)}>
              搜索
            </button>
          </div>
          <div className="worldscene-search-meta">
            {SEARCH_EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                className="worldscene-meta-chip"
                onClick={() => onSelectExample(example)}
              >
                {example}
              </button>
            ))}
          </div>
          {searchMessage && <p className="worldscene-helper-text">{searchMessage}</p>}
          {searchResults.length > 0 && (
            <div className="worldscene-search-results">
              {searchResults.map((entry, index) => (
                <button
                  key={entry.point.id}
                  type="button"
                  className="worldscene-search-hit"
                  onClick={() => onSelectResult(entry.point.id)}
                >
                  <span>Top {index + 1}</span>
                  <strong>{entry.point.name}</strong>
                  <em>{entry.point.country}</em>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
