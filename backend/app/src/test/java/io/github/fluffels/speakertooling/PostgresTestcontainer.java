package io.github.fluffels.speakertooling;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.testcontainers.postgresql.PostgreSQLContainer;

/** Einzige Stelle, die das Postgres-Image der Tests nennt (gleiches Major wie compose.yaml). */
@TestConfiguration(proxyBeanMethods = false)
public class PostgresTestcontainer {

	public static final String IMAGE = "postgres:18";

	@Bean
	@ServiceConnection
	PostgreSQLContainer postgresContainer() {
		return new PostgreSQLContainer(IMAGE);
	}

}
