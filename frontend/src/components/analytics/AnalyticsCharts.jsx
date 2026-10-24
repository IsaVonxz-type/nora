import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

function TrendLineChart({ data }) {
  return (
    <figure aria-label="Gráfico de tendencia diaria de reservas">
      <figcaption className="sr-only">Tendencia diaria de reservas</figcaption>
      <div className="analytics-chart-wrap">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.25)" />
            <XAxis dataKey="fecha" />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="reservas" stroke="#047857" strokeWidth={2.5} name="Reservas" />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Datos de tendencia diaria</caption>
        <thead>
          <tr>
            <th scope="col">Fecha</th>
            <th scope="col">Reservas</th>
            <th scope="col">Horas reservadas</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.fecha}>
              <td>{row.fecha}</td>
              <td>{row.reservas}</td>
              <td>{row.horas}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

function HoursBarChart({ data }) {
  return (
    <figure aria-label="Gráfico de horas reservadas por día">
      <figcaption className="sr-only">Horas reservadas por día</figcaption>
      <div className="analytics-chart-wrap">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.25)" />
            <XAxis dataKey="fecha" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="horas" fill="#0ea5e9" radius={[6, 6, 0, 0]} name="Horas" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

export default function AnalyticsChartsPanel({ tendenciaDiaria }) {
  const empty = tendenciaDiaria.length === 0;
  return (
    <div className="two-col analytics-charts-grid">
      <section className="panel stack-md analytics-chart-panel">
        <h3>Tendencia diaria</h3>
        {empty ? (
          <p className="subtle">Sin datos para el rango seleccionado.</p>
        ) : (
          <TrendLineChart data={tendenciaDiaria} />
        )}
      </section>

      <section className="panel stack-md analytics-chart-panel">
        <h3>Horas reservadas por día</h3>
        {empty ? (
          <p className="subtle">Sin datos para el rango seleccionado.</p>
        ) : (
          <HoursBarChart data={tendenciaDiaria} />
        )}
      </section>
    </div>
  );
}
