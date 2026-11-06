import { fireEvent, screen, waitFor } from "@testing-library/react"
import { ApiError, api, getSession } from "../lib/api"
import { renderApp, sessionFor } from "../test-utils"
import { Login } from "./Login"

afterEach(() => vi.restoreAllMocks())

const fill = (email: string, password: string) => {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } })
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: password } })
}

describe("Login", () => {
  it("keeps the button disabled until both fields are filled", () => {
    renderApp(<Login />, { role: null })
    const button = screen.getByRole("button", { name: "Sign in" })
    expect(button).toBeDisabled()
    fill("a@b.c", "x")
    expect(button).toBeEnabled()
  })

  it("signs in and stores the session", async () => {
    vi.spyOn(api, "login").mockResolvedValue(sessionFor("manufacturer"))
    renderApp(<Login />, { role: null })
    fill("pearl@x.test", "secret")
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }))
    await waitFor(() => expect(getSession()?.user.role).toBe("manufacturer"))
    expect(api.login).toHaveBeenCalledWith("pearl@x.test", "secret")
  })

  it("shows the server's message when sign-in fails, without clearing the email", async () => {
    vi.spyOn(api, "login").mockRejectedValue(new ApiError(401, "BAD_CREDENTIALS", "Email or password is incorrect"))
    renderApp(<Login />, { role: null })
    fill("a@b.c", "wrong")
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Email or password is incorrect")
    expect(screen.getByLabelText("Email")).toHaveValue("a@b.c")
    expect(getSession()).toBeNull()
  })
})
