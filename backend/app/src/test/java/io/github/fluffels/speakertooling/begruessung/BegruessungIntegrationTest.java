package io.github.fluffels.speakertooling.begruessung;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

import io.github.fluffels.speakertooling.PostgresTestcontainer;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

@Import(PostgresTestcontainer.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class BegruessungIntegrationTest {

	@LocalServerPort
	int port;

	@Autowired
	JdbcClient jdbc;

	private HttpResponse<String> get() throws Exception {
		var request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/begruessung")).build();
		return HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString());
	}

	@Test
	void liefertDenTextAusDerMigration() throws Exception {
		var response = get();
		assertThat(response.statusCode()).isEqualTo(200);
		assertThat(response.body()).isEqualTo("{\"text\":\"Falsch\"}");
	}

	@Test
	void ausgelieferterTextFolgtDerDatenbankOhneCache() throws Exception {
		var original = jdbc.sql("select text from app.begruessung where id = 1").query(String.class).single();
		try {
			jdbc.sql("update app.begruessung set text = 'Geaendert per SQL' where id = 1").update();
			assertThat(get().body()).isEqualTo("{\"text\":\"Geaendert per SQL\"}");
		}
		finally {
			jdbc.sql("update app.begruessung set text = :text where id = 1").param("text", original).update();
		}
	}

}
