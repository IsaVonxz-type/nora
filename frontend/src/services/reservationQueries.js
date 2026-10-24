export function invalidateReservationQueries(queryClient) {
  return queryClient.invalidateQueries({
    predicate: ({ queryKey }) => ["reservas-semana", "reservas-mes", "reservas-hoy", "operaciones", "analytics"].includes(queryKey[0]),
  });
}
