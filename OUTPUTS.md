# Column Naming Strategy

```typescript
// Format:
// calc__label:<humanLabel>__tf:<timeframe>__id:<indicator>__<param>:<value>__out:<output>

// 1. prefix = "calc__"
// - columns that we care about the value
// - anything without this prefix is ignored

// 2. label = label:<humanLabel>
// - human/internal reference label
// - used for readability, not machine meaning
// - should contain only letters and numbers
// - example: label:20smaOn5minChart

// 3. timeframe = tf:<interval><intervalType> (this is not the driver series, that is implicit for whatever the .csv file is. This tf is either the same as the file OR an alternate context)
// - tf:same = implicit from csv file
// - tf:1d = 1 day
// - tf:1s = 1 second
// - tf:5m = 5 minutes
// - tf:10r = 10 range bars
// - tf:15s = 15 seconds
// - tf:100t = 100 tick bars
// - tf:500v = 500 volume bars

// 4. indicator id = id:<indicator>
// - id:sma = simple moving average
// - id:ema = exponential moving average
// - id:rsi = relative strength index
// - id:macd = moving average convergence divergence

// 5. indicator params = <param>:<value>
// - params are arbitrary key/value pairs
// - src:open
// - len:100
// - fast:12
// - slow:26
// - signal:9

// 6. indicator output
// - the column value is the calculated indicator output for that full definition
// - example: calc__label:100sma__tf:same__id:sma__src:close__len:100__out:value

// Examples:
// 100 sma
// calc__label:100sma__tf:same__id:sma__src:close__len:100__out:value

// 20d sma
// calc__label:20daySMA__tf:1d__id:sma__src:close__len:20__out:value

// MACD
// calc__label:macd__tf:same__id:macd__src:close__fast:12__slow:26__signal:9__out:value
// calc__label:macd__tf:same__id:macd__src:close__fast:12__slow:26__signal:9__out:hist
// calc__label:macd__tf:same__id:macd__src:close__fast:12__slow:26__signal:9__out:signal
```

# Parsing Column Label

```typescript
type ParsedCalcColumnLabel = {
	id: string;
	label: string;
	params: Record<string, string>;
	out: string;
	tf: string;
};

export function parseCalcColumnLabel(columnLabel: string): ParsedCalcColumnLabel {
	const parts = columnLabel.replace('calc__', '').split('__');

	const parsed: ParsedCalcColumnLabel = {
		id: '',
		label: '',
		params: {},
		out: '',
		tf: ''
	};

	for (const part of parts) {
		const [key, value] = part.split(':');

		if (key === 'id') parsed.id = value;
		else if (key === 'label') parsed.label = value;
		else if (key === 'out') parsed.out = value;
		else if (key === 'tf') parsed.tf = value;
		else parsed.params[key] = value;
	}

	return parsed;
}
```

# Calculations JSON

This record is automatically created at the end of validation for each `data-out/<symbol>/tradester_<symbol>_<timeframe>.csv`. Indicators are determined from which columns are present inside the sierra exported .txt file. The only manual steps are adding indicators and proper calc keys to the `!tradester.Cht` chartbook file

```typescript
// Example Filename
// - Data goes in tradester_ES_1d.csv
// - JSON metadata goes in tradester_ES_1d.json

// Example Shape
type CalculationsJSON = {
    symbol: <symbol>
    timeframe: <timeframe>,
    indicators: {
        label: <humanLabel>,
        id: <indicator>
        inputs: {
            key: value
        },
        outputKeys: []
    }[]
}
```
