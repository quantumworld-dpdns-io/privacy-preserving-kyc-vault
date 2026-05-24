FROM trinodb/trino:435

USER root
RUN mkdir -p /usr/lib/trino/plugin/iceberg

COPY --from=trinodb/trino:435 \
    /usr/lib/trino/plugin/iceberg \
    /usr/lib/trino/plugin/iceberg

COPY catalog/iceberg.properties /etc/trino/catalog/iceberg.properties
COPY catalog/postgres.properties /etc/trino/catalog/postgres.properties

USER trino

EXPOSE 8080

CMD ["/usr/lib/trino/bin/run-trino"]
