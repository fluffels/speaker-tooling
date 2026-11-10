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
@DirtiesContext
class DatenbankAusfallIntegrationTest {

	@LocalServerPort
	int port;

	@Autowired
	PostgreSQLContainer container;

	private HttpResponse<String> get(String pfad) throws Exception {
		var request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + pfad)).build();
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

		var response = get("/api/begruessung");
		assertThat(response.statusCode()).isBetween(500, 599);
		assertThat(response.body()).doesNotContain("trace").doesNotContain("Exception");
	}

}
