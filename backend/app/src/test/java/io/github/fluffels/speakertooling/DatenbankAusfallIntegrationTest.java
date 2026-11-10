package io.github.fluffels.speakertooling;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.test.annotation.DirtiesContext;
import org.testcontainers.postgresql.PostgreSQLContainer;

/** Negativfall: Die Datenbank fällt im laufenden Betrieb aus. */
@Import(PostgresTestcontainer.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class DatenbankAusfallIntegrationTest {

	@LocalServerPort
	int port;

	@Autowired
	PostgreSQLContainer container;

	private HttpResponse<String> get(String pfad) throws Exception {
		var request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + pfad)).timeout(java.time.Duration.ofSeconds(30)).build();
		return HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString());
	}

	@Test
	void gesundMeldetUpUndNachAusfallDownMitStatus503OhneDetails() throws Exception {
		var vorher = get("/actuator/health");
		assertThat(vorher.statusCode()).isEqualTo(200);
		assertThat(vorher.body()).isEqualTo("{\"status\":\"UP\"}");

		container.stop();

		var nachher = get("/actuator/health");
		assertThat(nachher.statusCode()).isEqualTo(503);
		assertThat(nachher.body()).isEqualTo("{\"status\":\"DOWN\"}");
	}

	@Test
	void begruessungBeiToterDatenbankLiefertFehlerOhneStacktrace() throws Exception {
		container.stop();

		var start = System.nanoTime();
		var response = get("/api/begruessung");
		// Standard connection-timeout 3 s (DB_CONNECTION_TIMEOUT_MS): ein Fehler kommt schnell, kein langes Hängen.
		assertThat(java.time.Duration.ofNanos(System.nanoTime() - start)).isLessThan(java.time.Duration.ofSeconds(10));
		assertThat(response.statusCode()).isBetween(500, 599);
		assertThat(response.body()).doesNotContain("trace").doesNotContain("Exception").doesNotContain("\"message\"");
	}

}
